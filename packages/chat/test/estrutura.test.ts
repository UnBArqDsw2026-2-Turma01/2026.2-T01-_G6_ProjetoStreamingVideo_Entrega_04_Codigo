import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventBusEmMemoria,
  liveId,
  usuarioId,
  type MensagemChat,
  type MensagemDestacada,
  type MensagemEntregue,
} from '@g6/shared-kernel';
import {
  FakeModeracao,
  casosChatPort,
} from '@g6/shared-kernel/testing';
import { ChatService } from '../src/ChatService';

function criarChat() {
  const moderacao = new FakeModeracao();
  const eventos = new EventBusEmMemoria();
  const chat = new ChatService({ moderacao, eventos });
  return { chat, moderacao, eventos };
}

const casos = casosChatPort(() => criarChat().chat);

for (const caso of casos) {
  test(`Contrato ChatPort: ${caso.nome}`, caso.executar);
}

test('mensagem destacada aprovada chega a todos os inscritos', async () => {
  const { chat, eventos } = criarChat();
  const live = liveId('live_destaque');
  const recebidas: MensagemEntregue[] = [];
  const eventosPublicados: string[] = [];

  eventos.assinar('MensagemPublicada', (evento) => {
    eventosPublicados.push(evento.tipo);
  });

  chat.inscrever(live, (mensagem) => recebidas.push(mensagem));
  chat.inscrever(live, (mensagem) => recebidas.push(mensagem));

  const mensagem: MensagemDestacada = {
    id: 'msg_destaque',
    autor: usuarioId('usr_1'),
    nomeAutor: 'Usuário 1',
    texto: 'Obrigado pela live!',
    em: new Date(),
    valor: 100,
    cor: '#FF0000',
    tempoFixacaoMin: 5,
  };

  const resultado = await chat.publicarDestacada(live, mensagem);

  assert.equal(resultado.ok, true);
  assert.equal(recebidas.length, 2);
  assert.equal(recebidas.every((item) => item.destacada), true);
  assert.deepEqual(eventosPublicados, ['MensagemPublicada']);
});

test('mensagem bloqueada não chega aos inscritos', async () => {
  const { chat, moderacao } = criarChat();
  const live = liveId('live_bloqueada');
  let entregues = 0;

  moderacao.proximoVeredito = {
    decisao: 'bloqueada',
    motivo: 'Conteúdo ofensivo',
  };

  chat.inscrever(live, () => entregues++);

  const mensagem: MensagemChat = {
    id: 'msg_bloqueada',
    autor: usuarioId('usr_2'),
    nomeAutor: 'Usuário 2',
    texto: 'mensagem bloqueada',
    em: new Date(),
  };

  const resultado = await chat.publicar(live, mensagem);

  assert.equal(resultado.ok, false);
  assert.equal(entregues, 0);
  assert.equal(chat.registrosAuditoria.length, 1);
});

test('mensagem em quarentena fica na fila e não é entregue', async () => {
  const { chat, moderacao } = criarChat();
  const live = liveId('live_quarentena');
  let entregues = 0;

  moderacao.proximoVeredito = {
    decisao: 'quarentena',
    motivo: 'Link suspeito',
  };

  chat.inscrever(live, () => entregues++);

  const mensagem: MensagemChat = {
    id: 'msg_quarentena',
    autor: usuarioId('usr_3'),
    nomeAutor: 'Usuário 3',
    texto: 'https://exemplo.test',
    em: new Date(),
  };

  const resultado = await chat.publicar(live, mensagem);

  assert.equal(resultado.ok, false);
  assert.equal(entregues, 0);
  assert.equal(chat.entradasQuarentena.length, 1);
});
