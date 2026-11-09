import * as shared_kernel from '@g6/shared-kernel';
import * as identidade from '@g6/identidade';
import * as transmissao from '@g6/transmissao';
import * as conteudo from '@g6/conteudo';
import * as monetizacao from '@g6/monetizacao';
import * as chat from '@g6/chat';
import * as moderacao from '@g6/moderacao';

// Composition root do CA-01: aqui os serviços reais serão instanciados e ligados pelos ports.
// Por enquanto só confirma que todos os pacotes do workspace carregam. Implementação: #15.
const pacotes = { shared_kernel, identidade, transmissao, conteudo, monetizacao, chat, moderacao };

console.log('CA-01 — Live com doação destacada');
console.log('Pacotes carregados:', Object.keys(pacotes).join(', '));
console.log('Roteiro ainda não implementado: ver https://github.com/UnBArqDsw2026-2-Turma01/2026.2-T01-_G6_ProjetoStreamingVideo_Entrega_04_Codigo/issues/15');
