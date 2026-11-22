import { randomBytes } from 'node:crypto';
import { Account, AccountStatus, AutenticacaoService, Credential, TwoFactorAuth, generateTotp } from '@g6/identidade';
import { InMemoryAccountRepository } from '../../packages/identidade/src/autenticacao/dominio/account';
import { InMemorySessionStore, HmacTokenService } from '../../packages/identidade/src/autenticacao/dominio/session';
import { LoginRateLimiter } from '../../packages/identidade/src/autenticacao/dominio/login-rate-limiter';
import { LeakedPasswordBloomFilter } from '../../packages/identidade/src/autenticacao/dominio/leaked-password-bloom-filter';
import { EventBusEmMemoria, canalId, liveId, usuarioId, type ChatPort, type EventoDe, type MensagemChat, type Sessao, type TransmissaoPort } from '@g6/shared-kernel';
import { ChatService } from '@g6/chat';
import { ModeracaoService } from '@g6/moderacao';
import { Usuario } from '../../packages/monetizacao/src/comum/dominio';
import { RepositorioEmMemoria } from '../../packages/monetizacao/src/comum/compartilhado';
import { ServicoFinanceiro } from '../../packages/monetizacao/src/comum/financeiro';
import { montarDoacao } from '../../packages/monetizacao/src/doacao';

export const SENHA = 'Senha-qualidade!';
export const INSTANTE = new Date('2026-11-22T12:00:00Z');
const SEGREDO_TESTE = Buffer.from('segredo-publico-qualidade');
const HASH_TESTE = { N: 1024, r: 8, p: 1 };

export function criarIdentidade() {
  let agora = new Date(INSTANTE);
  const criador = new Account({ id: 'criador-qa', email: 'criador@qa.test', role: 'CREATOR',
    status: AccountStatus.ACTIVE, credential: Credential.fromPlainText(SENHA, HASH_TESTE),
    twoFactor: new TwoFactorAuth(SEGREDO_TESTE) });
  const espectador = new Account({ id: 'espectador-qa', email: 'espectador@qa.test', role: 'VIEWER',
    status: AccountStatus.ACTIVE, credential: Credential.fromPlainText(SENHA, HASH_TESTE) });
  const sessoes = new InMemorySessionStore();
  const autenticacao = new AutenticacaoService({ relogio: () => agora, dependencias: {
    accounts: new InMemoryAccountRepository([criador, espectador]), sessions: sessoes,
    tokens: new HmacTokenService(randomBytes(32)), rateLimiter: new LoginRateLimiter(),
    leakedPasswords: LeakedPasswordBloomFilter.fromList(['senha123']), scryptParams: HASH_TESTE,
    clientIntegrity: { minDifficulty: 1, maxAgeMs: 120_000 },
  } });
  return { autenticacao, criador, espectador, sessoes,
    codigo: () => generateTotp(SEGREDO_TESTE, agora),
    avancar: (ms: number) => { agora = new Date(agora.getTime() + ms); } };
}

export function mensagem(texto: string): MensagemChat {
  return { id: 'msg-qa', autor: usuarioId('espectador-qa'),
    nomeAutor: 'Espectador', texto, em: new Date(INSTANTE) };
}

/** Serviços reais; só o catálogo da live é uma fixture, pois a composição CLI #15 está pendente. */
export function criarDoacao(sessaoCriador: Sessao, sessaoDoador: Sessao, falharDestaque: boolean) {
  const bus = new EventBusEmMemoria();
  const chatReal = new ChatService({ moderacao: new ModeracaoService(), eventos: bus });
  const live = liveId('live-qa');
  const recebidas: unknown[] = [];
  chatReal.inscrever(live, m => recebidas.push(m));
  const chat: ChatPort = falharDestaque ? {
    publicar: chatReal.publicar.bind(chatReal), inscrever: chatReal.inscrever.bind(chatReal),
    publicarDestacada: async () => ({ ok: false, erro: { codigo: 'CHAT_INDISPONIVEL', mensagem: 'Chat indisponível' } }),
  } : chatReal;
  const doador = new Usuario(sessaoDoador.usuarioId, 'Espectador', 'espectador@qa.test');
  const criador = new Usuario(sessaoCriador.usuarioId, 'Criador', 'criador@qa.test');
  criador.perfil.habilitarMonetizacao(); doador.carteira.adicionarMoedaVirtual(1000);
  const usuarios = new RepositorioEmMemoria<Usuario>(); usuarios.salvar(doador); usuarios.salvar(criador);
  const resumo = { live, canal: canalId('canal-qa'), criador: sessaoCriador.usuarioId, titulo: 'QA', iniciadaEm: new Date(INSTANTE) };
  const transmissao: TransmissaoPort = {
    consultar: async id => id === live ? { ok: true, valor: resumo } : { ok: false, erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Live inexistente' } },
    abrir: async () => { throw new Error('A fixture não implementa abertura; depende da CLI #15'); },
    encerrar: async () => { throw new Error('A fixture não implementa encerramento; depende da CLI #15'); },
  };
  const eventos: EventoDe<'DoacaoConfirmada'>[] = [];
  bus.assinar('DoacaoConfirmada', e => eventos.push(e));
  const { servico } = montarDoacao({ usuarios, chat, transmissao, eventBus: bus, financeiro: new ServicoFinanceiro() });
  return { servico, doador, criador, eventos, recebidas, live };
}
