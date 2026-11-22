import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventBusEmMemoria,
  canalId,
  liveId,
  usuarioId,
  type EventoDominio,
  type MensagemEntregue,
} from '@g6/shared-kernel';
import { FakeModeracao, FakeTransmissao } from '@g6/shared-kernel/testing';
import { ChatService } from '@g6/chat';
// A doação (montarDoacao) e as entidades de apoio ainda não são exportadas por @g6/monetizacao;
// como apps/* é o composition root, o teste as importa direto da fonte do pacote.
import { montarDoacao } from '../../../../packages/monetizacao/src/doacao';
import { RepositorioEmMemoria } from '../../../../packages/monetizacao/src/comum/compartilhado';
import { Usuario } from '../../../../packages/monetizacao/src/comum/dominio';
import { ServicoFinanceiro } from '../../../../packages/monetizacao/src/comum/financeiro';

/**
 * Integração do fluxo de doação com mensagem destacada usando o ChatService real
 * (pedido de revisão do PR #38): a confirmação financeira não pode depender da
 * entrega do destaque no chat (D05).
 */

const VALOR = 500;
const REPASSE_CENTAVOS = 1000; // 500 moedas × 2 centavos de repasse

function criarCenario() {
  const eventos = new EventBusEmMemoria();
  const publicados: EventoDominio[] = [];
  eventos.assinar('DoacaoConfirmada', (evento) => publicados.push(evento));
  eventos.assinar('MensagemPublicada', (evento) => publicados.push(evento));

  const moderacao = new FakeModeracao();
  const chat = new ChatService({ moderacao, eventos });

  const live = liveId('live_integracao');
  const doador = new Usuario(usuarioId('usr_doador'), 'Espectador', 'doador@exemplo.com');
  const criador = new Usuario(usuarioId('usr_criador'), 'Criador', 'criador@exemplo.com');
  criador.perfil.habilitarMonetizacao();
  doador.carteira.adicionarMoedaVirtual(1000);

  const usuarios = new RepositorioEmMemoria<Usuario>();
  usuarios.salvar(doador);
  usuarios.salvar(criador);

  const transmissao = new FakeTransmissao();
  transmissao.livesAbertas.set(live, {
    live,
    canal: canalId('canal_integracao'),
    criador: usuarioId(criador.id),
    titulo: 'Live de integração',
    iniciadaEm: new Date(),
  });

  const { servico, repositorioDoacoes } = montarDoacao({
    financeiro: new ServicoFinanceiro(),
    chat,
    transmissao,
    eventBus: eventos,
    usuarios,
  });

  const sessao = {
    usuarioId: usuarioId(doador.id),
    papel: 'espectador' as const,
    token: 't',
    expiraEm: new Date(Date.now() + 60_000),
  };

  const saldos = () => ({
    moedasDoador: doador.carteira.saldoMoedaVirtual,
    centavosCriador: criador.carteira.saldoDinheiro.centavos,
  });

  return { servico, chat, moderacao, live, sessao, publicados, repositorioDoacoes, saldos };
}

function tipos(publicados: EventoDominio[]) {
  return publicados.map((evento) => evento.tipo);
}

test('doação com destaque aprovado: entrega no chat, saldos e eventos', async () => {
  const { servico, chat, live, sessao, publicados, saldos } = criarCenario();
  const antes = saldos();
  const recebidas: MensagemEntregue[] = [];
  chat.inscrever(live, (mensagem) => recebidas.push(mensagem));

  const resultado = await servico.doar(sessao, live, VALOR, 'Valeu pela live!');

  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.valor.destaqueEntregue, true);
    assert.equal(resultado.valor.aviso, undefined);
  }
  assert.deepEqual(saldos(), {
    moedasDoador: antes.moedasDoador - VALOR,
    centavosCriador: antes.centavosCriador + REPASSE_CENTAVOS,
  });
  assert.equal(recebidas.length, 1);
  assert.equal(recebidas[0]!.destacada, true);
  assert.deepEqual(tipos(publicados), ['MensagemPublicada', 'DoacaoConfirmada']);
});

test('listener do chat que lança não desfaz a doação nem impede os demais (regressão PR #38)', async () => {
  const { servico, chat, live, sessao, publicados, repositorioDoacoes, saldos } = criarCenario();
  const antes = saldos();
  let entreguesSaudavel = 0;

  chat.inscrever(live, () => {
    throw new Error('assinante desconectado');
  });
  chat.inscrever(live, () => entreguesSaudavel++);

  const resultado = await servico.doar(sessao, live, VALOR, 'Apoio!');

  // Resultado: a doação é confirmada e o destaque conta como entregue aos ouvintes saudáveis.
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.valor.destaqueEntregue, true);
  }
  // Saldos: o repasse aconteceu uma única vez.
  assert.deepEqual(saldos(), {
    moedasDoador: antes.moedasDoador - VALOR,
    centavosCriador: antes.centavosCriador + REPASSE_CENTAVOS,
  });
  assert.equal(repositorioDoacoes.listar().length, 1);
  // Chat: o ouvinte saudável recebeu e a falha ficou registrada.
  assert.equal(entreguesSaudavel, 1);
  assert.equal(chat.falhasEntrega.length, 1);
  // Eventos: MensagemPublicada e DoacaoConfirmada foram emitidos.
  assert.deepEqual(tipos(publicados), ['MensagemPublicada', 'DoacaoConfirmada']);
});

test('destaque bloqueado pela moderação: doação confirmada com aviso e sem MensagemPublicada', async () => {
  const { servico, chat, moderacao, live, sessao, publicados, saldos } = criarCenario();
  const antes = saldos();
  let entregues = 0;
  chat.inscrever(live, () => entregues++);
  moderacao.proximoVeredito = { decisao: 'bloqueada', motivo: 'Conteúdo ofensivo' };

  const resultado = await servico.doar(sessao, live, VALOR, 'mensagem qualquer');

  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.valor.destaqueEntregue, false);
    assert.match(resultado.valor.aviso ?? '', /Conteúdo ofensivo/);
  }
  assert.deepEqual(saldos(), {
    moedasDoador: antes.moedasDoador - VALOR,
    centavosCriador: antes.centavosCriador + REPASSE_CENTAVOS,
  });
  assert.equal(entregues, 0);
  assert.deepEqual(tipos(publicados), ['DoacaoConfirmada']);
});
