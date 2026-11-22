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
import { ChatService } from '../src/ChatService.js';

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

test('mensagem destacada bloqueada não chega aos inscritos', async () => {
  const { chat, moderacao } = criarChat();
  const live = liveId('live_destacada_bloqueada');
  let entregues = 0;

  moderacao.proximoVeredito = {
    decisao: 'bloqueada',
    motivo: 'Conteúdo destacado ofensivo',
  };

  chat.inscrever(live, () => entregues++);

  const mensagem: MensagemDestacada = {
    id: 'msg_destacada_bloqueada',
    autor: usuarioId('usr_4'),
    nomeAutor: 'Usuário 4',
    texto: 'mensagem destacada bloqueada',
    em: new Date(),
    valor: 200,
    cor: '#0000FF',
    tempoFixacaoMin: 10,
  };

  const resultado = await chat.publicarDestacada(live, mensagem);

  assert.equal(resultado.ok, false);
  assert.equal(entregues, 0);
});

test('mensagem destacada em quarentena não chega aos inscritos', async () => {
  const { chat, moderacao } = criarChat();
  const live = liveId('live_destacada_quarentena');
  let entregues = 0;

  moderacao.proximoVeredito = {
    decisao: 'quarentena',
    motivo: 'Link destacado suspeito',
  };

  chat.inscrever(live, () => entregues++);

  const mensagem: MensagemDestacada = {
    id: 'msg_destacada_quarentena',
    autor: usuarioId('usr_5'),
    nomeAutor: 'Usuário 5',
    texto: 'https://exemplo.test/destaque',
    em: new Date(),
    valor: 300,
    cor: null,
    tempoFixacaoMin: 0,
  };

  const resultado = await chat.publicarDestacada(live, mensagem);

  assert.equal(resultado.ok, false);
  assert.equal(entregues, 0);
  assert.equal(chat.entradasQuarentena.length, 1);
});

test('inscrições são isoladas entre lives diferentes', async () => {
  const { chat } = criarChat();
  const liveA = liveId('live_a');
  const liveB = liveId('live_b');
  let entreguesA = 0;
  let entreguesB = 0;

  chat.inscrever(liveA, () => entreguesA++);
  chat.inscrever(liveB, () => entreguesB++);

  const mensagem: MensagemChat = {
    id: 'msg_isolada',
    autor: usuarioId('usr_6'),
    nomeAutor: 'Usuário 6',
    texto: 'Olá!',
    em: new Date(),
  };

  await chat.publicar(liveA, mensagem);

  assert.equal(entreguesA, 1);
  assert.equal(entreguesB, 0);
});

test('cancelar uma inscrição não afeta os demais ouvintes da live', async () => {
  const { chat } = criarChat();
  const live = liveId('live_cancelamento');
  let primeiro = 0;
  let segundo = 0;

  const cancelarPrimeiro = chat.inscrever(live, () => primeiro++);
  chat.inscrever(live, () => segundo++);

  cancelarPrimeiro();

  const mensagem: MensagemChat = {
    id: 'msg_cancelamento',
    autor: usuarioId('usr_7'),
    nomeAutor: 'Usuário 7',
    texto: 'Mensagem após cancelamento',
    em: new Date(),
  };

  await chat.publicar(live, mensagem);

  assert.equal(primeiro, 0);
  assert.equal(segundo, 1);
});

test('falha de um ouvinte não impede os demais nem bloqueia o evento', async () => {
  const { chat, eventos } = criarChat();
  const live = liveId('live_ouvinte_falha');
  let entreguesSaudaveis = 0;
  let eventosPublicados = 0;

  eventos.assinar('MensagemPublicada', () => eventosPublicados++);

  chat.inscrever(live, () => {
    throw new Error('assinante desconectado');
  });
  chat.inscrever(live, () => entreguesSaudaveis++);

  const mensagem: MensagemChat = {
    id: 'msg_ouvinte_falha',
    autor: usuarioId('usr_8'),
    nomeAutor: 'Usuário 8',
    texto: 'Mensagem entregue apesar da falha',
    em: new Date(),
  };

  const resultado = await chat.publicar(live, mensagem);

  assert.equal(resultado.ok, true);
  assert.equal(entreguesSaudaveis, 1);
  assert.equal(eventosPublicados, 1);
  assert.equal(chat.falhasEntrega.length, 1);
});
