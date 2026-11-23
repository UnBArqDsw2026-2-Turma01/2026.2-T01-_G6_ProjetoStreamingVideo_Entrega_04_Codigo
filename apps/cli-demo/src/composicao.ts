// Composition root do CA-01: único lugar que conhece as implementações reais dos contextos.
//
// Cria o EventBus e os serviços reais e liga cada um aos ports do shared-kernel que ele
// consome (o chat recebe a moderação; a doação recebe o chat e a transmissão; o conteúdo
// reage a LiveIniciada e LiveEncerrada). Nada aqui usa rede: o pagamento é o processador
// simulado e a identidade usa as contas de demonstração do pacote.
import {
  EventBusEmMemoria,
  type AutenticacaoPort,
  type DoacaoPort,
  type EventoDominio,
  type TransmissaoPort,
} from '@g6/shared-kernel';
import { criarAutenticacaoExemplo } from '@g6/identidade';
import { TransmissaoService, type IObserver, type StreamEvent } from '@g6/transmissao';
import { ConteudoDeLive } from '@g6/conteudo';
import { ChatService } from '@g6/chat';
import { ModeracaoService } from '@g6/moderacao';
// Recarga, doação e as entidades de apoio vêm do ponto de entrada público de @g6/monetizacao.
import { gatewaysDoAmbiente, montarDoacao, RecargaService, RepositorioEmMemoria, ServicoFinanceiro, Usuario } from '@g6/monetizacao';

/** Os dois ids são os das contas de demonstração do pacote `@g6/identidade`. */
export const ID_CRIADOR = 'criador-ca01';
export const ID_ESPECTADOR = 'espectador-ca01';

/** Seguidor que o Observer do canal avisa quando a live entra no ar (passo 2). */
export class SeguidorObserver implements IObserver {
  readonly id = 'seguidor-demo';
  readonly name = 'Seguidor do criador';
  readonly targetSystem = 'demo';
  readonly recebidos: StreamEvent['type'][] = [];

  update(evento: StreamEvent): void {
    this.recebidos.push(evento.type);
  }
}

const TIPOS_REGISTRADOS = [
  'LiveIniciada',
  'RecargaConcluida',
  'DoacaoConfirmada',
  'MensagemPublicada',
  'LiveEncerrada',
] as const;

/** O que o canal da live usou de fato, capturado quando ele é criado (passo 2). */
export interface ObservacaoDoCanal {
  estrategiaDeDespacho?: string;
  resolucao?: string;
  latencia?: string;
}

export interface Sistema {
  /** Eventos de domínio na ordem em que foram publicados, para o roteiro e o teste. */
  readonly publicados: EventoDominio[];
  readonly autenticacao: AutenticacaoPort;
  readonly credenciais: { readonly senha: string; readonly codigoCriador: () => string };
  readonly transmissao: TransmissaoPort;
  readonly seguidor: SeguidorObserver;
  readonly canal: ObservacaoDoCanal;
  readonly recarga: RecargaService;
  /** Quem "paga" no processador simulado e o segredo que assina o aviso do pagamento. */
  readonly pagamento: {
    readonly aprovar: (idPagamento: string) => void;
    readonly segredo: string;
  };
  readonly doacao: DoacaoPort;
  readonly chat: ChatService;
  readonly conteudo: ConteudoDeLive;
  /** Carteiras do domínio de monetização, para mostrar os saldos. */
  readonly criador: Usuario;
  readonly espectador: Usuario;
}

export async function compor(): Promise<Sistema> {
  const eventos = new EventBusEmMemoria();
  const publicados: EventoDominio[] = [];
  for (const tipo of TIPOS_REGISTRADOS) eventos.assinar(tipo, (evento) => publicados.push(evento));

  // Identidade (Chain of Responsibility): contas e senha de demonstração.
  const exemplo = criarAutenticacaoExemplo();

  // Monetização: o mesmo cadastro de usuários serve à recarga e à doação.
  const usuarios = new RepositorioEmMemoria<Usuario>();
  const criador = new Usuario(ID_CRIADOR, 'Criador', 'criador@ca01.test');
  criador.perfil.habilitarMonetizacao();
  const espectador = new Usuario(ID_ESPECTADOR, 'Espectador', 'espectador@ca01.test');
  usuarios.salvar(criador);
  usuarios.salvar(espectador);
  const financeiro = new ServicoFinanceiro();

  // Transmissão (Builder + Director → Observer + Strategy). O seguidor é anexado ao canal.
  const seguidor = new SeguidorObserver();
  const observacaoDoCanal: ObservacaoDoCanal = {};
  const transmissao = new TransmissaoService({
    eventBus: eventos,
    configurarCanal: (canal) => {
      canal.attach(seguidor);
      // O Strategy de despacho e a configuração montada pelo Builder/Director, para o roteiro mostrar.
      observacaoDoCanal.estrategiaDeDespacho = canal.getDispatchStrategyName();
      observacaoDoCanal.resolucao = canal.getStreamConfig()?.resolution;
      observacaoDoCanal.latencia = canal.getStreamConfig()?.latencyMode;
    },
  });

  // Conteúdo (Factory Method): reage aos eventos da transmissão sem conhecê-la.
  const conteudo = new ConteudoDeLive({ eventos, transmissao });
  conteudo.assinar();

  // Recarga (Decorator + Adapter + Proxy). Só o processador simulado: nenhum acesso à rede.
  const { gateways, simulador, segredos } = await gatewaysDoAmbiente({});
  const recarga = new RecargaService({ gateways, financeiro, usuarios, eventos });
  const segredo = segredos.simulado;
  if (!segredo) throw new Error('o meio simulado deve sempre ter segredo');

  // Moderação (AutoMod + Strategy) → chat (Observer) → doação (Facade + Mediator).
  const moderacao = new ModeracaoService();
  const chat = new ChatService({ moderacao, eventos });
  const { servico: doacao } = montarDoacao({ financeiro, chat, transmissao, eventBus: eventos, usuarios });

  return {
    publicados,
    autenticacao: exemplo.autenticacao,
    credenciais: { senha: exemplo.senha, codigoCriador: () => exemplo.codigoCriador() },
    transmissao,
    seguidor,
    canal: observacaoDoCanal,
    recarga,
    pagamento: { aprovar: (idPagamento) => simulador.aprovar(idPagamento), segredo },
    doacao,
    chat,
    conteudo,
    criador,
    espectador,
  };
}
