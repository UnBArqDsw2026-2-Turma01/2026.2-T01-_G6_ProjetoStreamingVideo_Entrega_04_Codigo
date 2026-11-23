// Roteiro do CA-01 (live com doação destacada): os seis passos, chamando os ports.
//
// O roteiro não conhece nenhuma implementação: recebe o `Sistema` já composto e narra cada
// passo com o padrão GoF que está em ação. Cada afirmação impressa é conferida no código:
// um resultado inesperado lança `FalhaNoRoteiro` com o número do passo. A saída vai por
// `escrever`, então o teste roda o mesmo roteiro em silêncio e confere o resultado estruturado.
//
// `RecargaService.receberAviso` (o aviso do processador, fora do `RecargaPort`), a inscrição
// no `ChatService` e os saldos do domínio de monetização não são ports: o roteiro os usa porque
// é o papel de um app compor o que o contrato deixa de fora.
import {
  pacoteId,
  type ComprovanteDoacao,
  type EventoDominio,
  type LiveId,
  type MensagemEntregue,
  type Sessao,
} from '@g6/shared-kernel';
import { assinarNotificacao, type NotificacaoPagamento } from '@g6/monetizacao';
import type { RecordedVideo } from '@g6/conteudo';
import { ID_CRIADOR, ID_ESPECTADOR, type Sistema } from './composicao';

/** Moedas que o espectador doa: cai na faixa verde (500 a 1999), com mensagem destacada. */
export const VALOR_DOACAO = 500;
export const MENSAGEM_DOACAO = 'Valeu pela live!';
/** 500 moedas × 2 centavos de repasse por moeda. */
export const REPASSE_ESPERADO_CENTAVOS = VALOR_DOACAO * 2;
const TITULO_DA_LIVE = 'Live com doação destacada';

export interface ResultadoCA01 {
  readonly live: LiveId;
  readonly sessaoCriador: Sessao;
  readonly sessaoEspectador: Sessao;
  /** Passo 1: erros devolvidos como `Resultado` (senha errada; criador sem o segundo fator). */
  readonly errosDeLogin: { readonly senhaErrada: string; readonly semSegundoFator: string };
  /** Passo 2: o que o canal usou e o que o seguidor recebeu logo depois de abrir. */
  readonly canal: { readonly estrategia: string; readonly resolucao: string; readonly latencia: string };
  readonly seguidorAposAbrir: readonly string[];
  /** Passo 3: efeito de cada aviso de pagamento no Proxy e saldo creditado. */
  readonly avisos: { readonly falsificado: string; readonly autentico: string; readonly reenvio: string };
  readonly moedasCreditadas: number;
  readonly comprovante: ComprovanteDoacao;
  readonly entregues: readonly MensagemEntregue[];
  readonly vod: RecordedVideo;
  readonly eventos: readonly EventoDominio['tipo'][];
  readonly saldos: {
    readonly moedasEspectador: number;
    readonly centavosCriador: number;
  };
}

/** Um passo que deveria dar certo e não deu: leva o número do passo para a mensagem. */
export class FalhaNoRoteiro extends Error {
  constructor(
    readonly passo: number,
    detalhe: string,
  ) {
    super(`Passo ${passo} falhou: ${detalhe}`);
    this.name = 'FalhaNoRoteiro';
  }
}

export async function executarCA01(
  sistema: Sistema,
  escrever: (linha: string) => void = () => undefined,
): Promise<ResultadoCA01> {
  const passo = (n: number, titulo: string, padrao: string) => {
    escrever(`\nPasso ${n} — ${titulo}`);
    escrever(`  Padrão em ação: ${padrao}`);
  };
  const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
  /** "X publicado" só sai se o evento está mesmo no registro do barramento. */
  const publicado = (n: number, tipo: EventoDominio['tipo']) => {
    if (!sistema.publicados.some((e) => e.tipo === tipo)) throw new FalhaNoRoteiro(n, `${tipo} não foi publicado`);
    return `${tipo} publicado`;
  };
  const exigirEfeito = (n: number, descricao: string, obtido: string, esperado: string) => {
    if (obtido !== esperado) throw new FalhaNoRoteiro(n, `${descricao}: esperava ${esperado} e veio ${obtido}`);
  };

  // ---- 1. Login (Chain of Responsibility) ----
  passo(1, 'Criador e espectador fazem login', 'Chain of Responsibility (cadeia de verificações do login)');
  const { autenticacao, credenciais } = sistema;
  const errado = await autenticacao.login({ email: 'espectador@ca01.test', senha: 'senha-errada' });
  if (errado.ok) throw new FalhaNoRoteiro(1, 'a senha errada não deveria autenticar');
  escrever(`  Senha errada: recusada com ${errado.erro.codigo}, sem exceção.`);
  const semTotp = await autenticacao.login({ email: 'criador@ca01.test', senha: credenciais.senha });
  if (semTotp.ok) throw new FalhaNoRoteiro(1, 'o criador não deveria entrar sem o segundo fator');
  escrever(`  Criador sem o código do segundo fator: recusado com ${semTotp.erro.codigo}.`);

  const criador = await autenticacao.login({
    email: 'criador@ca01.test',
    senha: credenciais.senha,
    codigoTotp: credenciais.codigoCriador(),
  });
  if (!criador.ok) throw new FalhaNoRoteiro(1, `login do criador: ${criador.erro.codigo}`);
  const espectador = await autenticacao.login({ email: 'espectador@ca01.test', senha: credenciais.senha });
  if (!espectador.ok) throw new FalhaNoRoteiro(1, `login do espectador: ${espectador.erro.codigo}`);
  escrever(`  Criador entrou como "${criador.valor.papel}" (com segundo fator) e espectador como "${espectador.valor.papel}".`);
  if (criador.valor.usuarioId !== ID_CRIADOR || espectador.valor.usuarioId !== ID_ESPECTADOR) {
    throw new FalhaNoRoteiro(1, 'as sessões não correspondem aos usuários da monetização');
  }

  // ---- 2. Abrir a live (Builder + Director → Observer + Strategy) ----
  passo(2, 'Criador abre a live por preset; seguidores são notificados', 'Builder + Director (configuração) → Observer + Strategy (canal)');
  const aberta = await sistema.transmissao.abrir(criador.valor, { preset: 'baixa-latencia', titulo: TITULO_DA_LIVE });
  if (!aberta.ok) throw new FalhaNoRoteiro(2, `${aberta.erro.codigo}: ${aberta.erro.mensagem}`);
  const live = aberta.valor.live;
  await sistema.conteudo.ocioso();
  const { estrategiaDeDespacho, resolucao, latencia } = sistema.canal;
  if (!estrategiaDeDespacho || !resolucao || !latencia) throw new FalhaNoRoteiro(2, 'o canal não informou a configuração usada');
  escrever(`  Live ${live} no ar no canal ${aberta.valor.canal}: "${aberta.valor.titulo}".`);
  escrever(`  [Builder + Director] preset "baixa-latencia" virou resolução ${resolucao} e latência ${latencia}.`);
  escrever(`  [Strategy] o canal despacha as notificações por "${estrategiaDeDespacho}".`);
  const seguidorAposAbrir = [...sistema.seguidor.recebidos];
  exigirEfeito(2, 'o seguidor deveria receber o início da live', seguidorAposAbrir.join(','), 'STREAM_STARTED');
  escrever(`  [Observer] o seguidor recebeu ${seguidorAposAbrir.join(', ')}.`);
  const registrada = await sistema.conteudo.liveDe(live);
  if (!registrada) throw new FalhaNoRoteiro(2, 'o conteúdo não registrou a live ao receber LiveIniciada');
  escrever(`  ${publicado(2, 'LiveIniciada')}; o conteúdo registrou a LiveStream (${registrada.status}).`);

  // ---- 3. Recarga (Decorator · Adapter · Proxy) ----
  passo(3, 'Espectador recarrega moeda virtual', 'Decorator (preço) · Adapter (processador) · Proxy (confirmação do aviso)');
  const ofertas = await sistema.recarga.ofertas(espectador.valor);
  if (!ofertas.ok) throw new FalhaNoRoteiro(3, `ofertas: ${ofertas.erro.codigo}`);
  const oferta = ofertas.valor.find((o) => o.moeda >= VALOR_DOACAO);
  if (!oferta) throw new FalhaNoRoteiro(3, `nenhum pacote cobre ${VALOR_DOACAO} moedas`);
  escrever(`  [Decorator] ${oferta.moeda} moedas por ${reais(oferta.precoCentavos)} (de ${reais(oferta.precoSemDescontoCentavos)}).`);

  const pedido = await sistema.recarga.recarregar(espectador.valor, pacoteId(oferta.pacote), 'simulado');
  if (!pedido.ok) throw new FalhaNoRoteiro(3, `recarregar: ${pedido.erro.codigo}`);
  const checkout = pedido.valor;
  escrever(`  [Adapter] Checkout ${checkout.recargaId} no meio "${checkout.meio}"; saldo ainda ${sistema.espectador.carteira.saldoMoedaVirtual}.`);

  const idPagamento = checkout.instrucoes.replace('pague o protocolo ', '');
  if (idPagamento === checkout.instrucoes) throw new FalhaNoRoteiro(3, 'formato inesperado das instruções do processador simulado');
  const aviso = (idEvento: string, segredo: string): NotificacaoPagamento => {
    const dados = { idEvento, idPagamento, recargaId: checkout.recargaId };
    return { ...dados, assinatura: assinarNotificacao(segredo, dados) };
  };
  const falsificado = await sistema.recarga.receberAviso('simulado', aviso('ev-0', 'segredo-do-atacante'));
  exigirEfeito(3, 'aviso falsificado', falsificado.efeito, 'NAO_AUTENTICO');
  escrever(`  [Proxy] Aviso falsificado: ${falsificado.efeito}.`);
  sistema.pagamento.aprovar(idPagamento);
  const autentico = await sistema.recarga.receberAviso('simulado', aviso('ev-1', sistema.pagamento.segredo));
  exigirEfeito(3, 'aviso autêntico', autentico.efeito, 'CREDITADO');
  escrever(`  [Proxy] Aviso autêntico depois do pagamento: ${autentico.efeito}.`);
  const reenvio = await sistema.recarga.receberAviso('simulado', aviso('ev-1', sistema.pagamento.segredo));
  exigirEfeito(3, 'reenvio do aviso', reenvio.efeito, 'DUPLICADO');
  escrever(`  [Proxy] Reenvio do mesmo aviso: ${reenvio.efeito}.`);

  const situacao = await sistema.recarga.consultar(espectador.valor, checkout.recargaId);
  if (!situacao.ok) throw new FalhaNoRoteiro(3, `consultar: ${situacao.erro.codigo}`);
  exigirEfeito(3, 'situação da recarga', situacao.valor.situacao, 'concluida');
  const moedasCreditadas = sistema.espectador.carteira.saldoMoedaVirtual;
  if (moedasCreditadas !== oferta.moeda) {
    throw new FalhaNoRoteiro(3, `esperava ${oferta.moeda} moedas creditadas e há ${moedasCreditadas}`);
  }
  escrever(`  consultar → concluida; ${publicado(3, 'RecargaConcluida')}; saldo do espectador: ${moedasCreditadas} moedas.`);

  // ---- 4. Doação com mensagem (Facade + Mediator; Decorator) ----
  passo(4, 'Espectador doa com mensagem; o repasse ocorre', 'Facade + Mediator (doação) · Decorator (mensagem destacada)');
  const entregues: MensagemEntregue[] = [];
  const cancelar = sistema.chat.inscrever(live, (mensagem) => entregues.push(mensagem));
  let comprovante: ComprovanteDoacao;
  try {
    const doada = await sistema.doacao.doar(espectador.valor, live, VALOR_DOACAO, MENSAGEM_DOACAO);
    if (!doada.ok) throw new FalhaNoRoteiro(4, `${doada.erro.codigo}: ${doada.erro.mensagem}`);
    comprovante = doada.valor;
  } finally {
    cancelar();
  }
  const centavosCriador = sistema.criador.carteira.saldoDinheiro.centavos;
  if (centavosCriador !== REPASSE_ESPERADO_CENTAVOS) {
    throw new FalhaNoRoteiro(4, `repasse esperado ${reais(REPASSE_ESPERADO_CENTAVOS)} e veio ${reais(centavosCriador)}`);
  }
  escrever(`  Doação ${comprovante.doacaoId} de ${comprovante.valor} moedas confirmada com a mensagem "${MENSAGEM_DOACAO}".`);
  escrever(`  Repasse ao criador: ${reais(centavosCriador)}; saldo do espectador: ${sistema.espectador.carteira.saldoMoedaVirtual} moedas.`);

  // ---- 5. Moderação e chat (Observer) ----
  passo(5, 'A mensagem destacada passa pela moderação e chega ao chat', 'AutoMod + Strategy (moderação) · Observer (ChatRoom)');
  if (!comprovante.destaqueEntregue) {
    throw new FalhaNoRoteiro(5, `o destaque não foi entregue: ${comprovante.aviso ?? 'sem aviso'}`);
  }
  const destaque = entregues.find((e) => e.destacada);
  if (!destaque) throw new FalhaNoRoteiro(5, 'nenhum ouvinte do chat recebeu a mensagem destacada');
  escrever('  O destaque passou pelo chat, que só entrega o que a moderação aprova (destaqueEntregue: true).');
  escrever(`  [Observer] o ouvinte do chat recebeu "${destaque.mensagem.texto}" de ${destaque.mensagem.nomeAutor}.`);
  escrever(`  ${publicado(5, 'MensagemPublicada')} e ${publicado(5, 'DoacaoConfirmada')}; ordem até aqui: ${sistema.publicados.map((e) => e.tipo).join(' → ')}.`);

  // ---- 6. Encerrar a live (Factory Method) ----
  passo(6, 'Criador encerra a live, que vira VOD', 'Factory Method (RecordedVideoCreator), reagindo só ao evento LiveEncerrada');
  const encerrada = await sistema.transmissao.encerrar(criador.valor, live);
  if (!encerrada.ok) throw new FalhaNoRoteiro(6, `${encerrada.erro.codigo}: ${encerrada.erro.mensagem}`);
  await sistema.conteudo.ocioso();
  const vod = await sistema.conteudo.gravacaoDe(live);
  if (!vod) throw new FalhaNoRoteiro(6, 'o conteúdo não criou o VOD ao receber LiveEncerrada');
  escrever(`  ${publicado(6, 'LiveEncerrada')}; o conteúdo criou o VOD ${vod.id} (${vod.processingStatus}), gravado da LiveStream ${vod.sourceStreamId}.`);

  const eventos = sistema.publicados.map((e) => e.tipo);
  escrever(`\nEventos publicados, em ordem: ${eventos.join(' → ')}.`);
  escrever('CA-01 concluído: seis passos executados pelos módulos reais, sem credenciais nem rede.');

  return {
    live,
    sessaoCriador: criador.valor,
    sessaoEspectador: espectador.valor,
    errosDeLogin: { senhaErrada: errado.erro.codigo, semSegundoFator: semTotp.erro.codigo },
    canal: { estrategia: estrategiaDeDespacho, resolucao, latencia },
    seguidorAposAbrir,
    avisos: { falsificado: falsificado.efeito, autentico: autentico.efeito, reenvio: reenvio.efeito },
    moedasCreditadas,
    comprovante,
    entregues,
    vod,
    eventos,
    saldos: {
      moedasEspectador: sistema.espectador.carteira.saldoMoedaVirtual,
      centavosCriador,
    },
  };
}
