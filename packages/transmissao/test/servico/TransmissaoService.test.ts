import {
  EventBusEmMemoria,
  liveId,
  usuarioId,
  type EventoDe,
  type PresetTransmissao,
  type Sessao,
} from '@g6/shared-kernel';
import { casosTransmissaoPort } from '@g6/shared-kernel/testing';
import { describe, expect, it } from 'vitest';
import type { IObserver, StreamEvent } from '../../src/canal';
import { TransmissaoService } from '../../src/servico';

const sessao = (id: string, papel: Sessao['papel'] = 'criador'): Sessao => ({
  usuarioId: usuarioId(id),
  papel,
  token: `token_${id}`,
  expiraEm: new Date(Date.now() + 60_000),
});

const preset = (titulo = 'Live de teste', nome: PresetTransmissao['preset'] = 'baixa-latencia'): PresetTransmissao => ({
  preset: nome,
  titulo,
});

/** Serviço com barramento próprio e coletores dos dois eventos de ciclo de vida. */
function montar(opcoes: Partial<ConstructorParameters<typeof TransmissaoService>[0]> = {}) {
  const eventBus = new EventBusEmMemoria();
  const iniciadas: Array<EventoDe<'LiveIniciada'>> = [];
  const encerradas: Array<EventoDe<'LiveEncerrada'>> = [];
  eventBus.assinar('LiveIniciada', (e) => iniciadas.push(e));
  eventBus.assinar('LiveEncerrada', (e) => encerradas.push(e));
  const servico = new TransmissaoService({ eventBus, ...opcoes });
  return { servico, eventBus, iniciadas, encerradas };
}

describe('TransmissaoService — suíte de contrato do TransmissaoPort', () => {
  for (const caso of casosTransmissaoPort(() => montar().servico)) {
    it(caso.nome, caso.executar);
  }
});

describe('TransmissaoService.abrir', () => {
  it('preset válido → live aberta → LiveIniciada publicado uma vez, com o mesmo id do resumo', async () => {
    const { servico, iniciadas } = montar();

    const resultado = await servico.abrir(sessao('usr_1'), preset('  Minha live  '));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.criador).toBe('usr_1');
    expect(resultado.valor.titulo).toBe('Minha live');
    expect(resultado.valor.iniciadaEm).toBeInstanceOf(Date);
    expect(iniciadas).toHaveLength(1);
    expect(iniciadas[0]?.live).toBe(resultado.valor.live);
    expect(iniciadas[0]?.canal).toBe(resultado.valor.canal);
  });

  it.each<Sessao['papel']>(['espectador', 'moderador'])('nega a abertura ao papel %s, sem evento', async (papel) => {
    const { servico, iniciadas } = montar();

    const resultado = await servico.abrir(sessao('usr_2', papel), preset());

    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'ACESSO_NEGADO' } });
    expect(iniciadas).toHaveLength(0);
  });

  it('título vazio vira CONFIGURACAO_INVALIDA com a regra R1, sem evento e sem reservar o criador', async () => {
    const { servico, iniciadas } = montar();

    const invalida = await servico.abrir(sessao('usr_3'), preset('   '));
    expect(invalida).toMatchObject({ ok: false, erro: { codigo: 'CONFIGURACAO_INVALIDA' } });
    expect(!invalida.ok && invalida.erro.mensagem).toMatch(/R1/);
    expect(iniciadas).toHaveLength(0);

    const valida = await servico.abrir(sessao('usr_3'), preset('Agora sim'));
    expect(valida.ok).toBe(true);
  });

  it('preset desconhecido é recusado como configuração inválida, sem lançar', async () => {
    const { servico } = montar();
    const pedido = { preset: 'inexistente', titulo: 'x' } as unknown as PresetTransmissao;

    const resultado = await servico.abrir(sessao('usr_4'), pedido);

    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'CONFIGURACAO_INVALIDA' } });
  });

  it('um criador não abre duas lives ao mesmo tempo, nem em chamadas concorrentes', async () => {
    const { servico, iniciadas } = montar();
    const criador = sessao('usr_5');

    const [a, b] = await Promise.all([servico.abrir(criador, preset('A')), servico.abrir(criador, preset('B'))]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const recusada = a.ok ? b : a;
    expect(recusada).toMatchObject({ ok: false, erro: { codigo: 'LIVE_JA_ABERTA' } });
    expect(iniciadas).toHaveLength(1);
  });

  it('criadores diferentes abrem lives em canais diferentes', async () => {
    const { servico, iniciadas } = montar();

    const a = await servico.abrir(sessao('usr_6'), preset());
    const b = await servico.abrir(sessao('usr_7'), preset());

    expect(a.ok && b.ok).toBe(true);
    expect(iniciadas).toHaveLength(2);
    expect(iniciadas[0]?.canal).not.toBe(iniciadas[1]?.canal);
    expect(iniciadas[0]?.live).not.toBe(iniciadas[1]?.live);
  });

  it('usa o gerador de LiveId injetado', async () => {
    const { servico } = montar({ gerarLiveId: () => liveId('live_fixa') });

    const resultado = await servico.abrir(sessao('usr_8'), preset());

    expect(resultado.ok && resultado.valor.live).toBe('live_fixa');
  });
});

describe('TransmissaoService.encerrar', () => {
  it('o criador encerra: LiveEncerrada publicado uma vez e a live deixa de ser consultável', async () => {
    const { servico, encerradas } = montar();
    const criador = sessao('usr_10');
    const aberta = await servico.abrir(criador, preset());
    if (!aberta.ok) throw new Error('abertura deveria funcionar');

    const resultado = await servico.encerrar(criador, aberta.valor.live);

    expect(resultado.ok).toBe(true);
    expect(encerradas).toHaveLength(1);
    expect(encerradas[0]?.live).toBe(aberta.valor.live);
    expect(encerradas[0]?.canal).toBe(aberta.valor.canal);
    expect((await servico.consultar(aberta.valor.live)).ok).toBe(false);
  });

  it('outro criador não encerra a live alheia, e a live segue no ar', async () => {
    const { servico, encerradas } = montar();
    const aberta = await servico.abrir(sessao('usr_11'), preset());
    if (!aberta.ok) throw new Error('abertura deveria funcionar');

    const resultado = await servico.encerrar(sessao('usr_12'), aberta.valor.live);

    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'ACESSO_NEGADO' } });
    expect(encerradas).toHaveLength(0);
    expect((await servico.consultar(aberta.valor.live)).ok).toBe(true);
  });

  it('live inexistente volta NAO_ENCONTRADA', async () => {
    const { servico } = montar();

    const resultado = await servico.encerrar(sessao('usr_13'), liveId('live_nao_existe'));

    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'NAO_ENCONTRADA' } });
  });

  it('encerrar duas vezes, inclusive em paralelo, publica LiveEncerrada uma única vez', async () => {
    const { servico, encerradas } = montar();
    const criador = sessao('usr_14');
    const aberta = await servico.abrir(criador, preset());
    if (!aberta.ok) throw new Error('abertura deveria funcionar');

    const [a, b] = await Promise.all([
      servico.encerrar(criador, aberta.valor.live),
      servico.encerrar(criador, aberta.valor.live),
    ]);
    const c = await servico.encerrar(criador, aberta.valor.live);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(c.ok).toBe(false);
    expect(encerradas).toHaveLength(1);
  });

  it('depois de encerrar, o mesmo criador abre uma nova live com outro id', async () => {
    const { servico, iniciadas } = montar();
    const criador = sessao('usr_15');
    const primeira = await servico.abrir(criador, preset('Primeira'));
    if (!primeira.ok) throw new Error('abertura deveria funcionar');
    await servico.encerrar(criador, primeira.valor.live);

    const segunda = await servico.abrir(criador, preset('Segunda'));

    expect(segunda.ok).toBe(true);
    expect(iniciadas).toHaveLength(2);
    expect(segunda.ok && segunda.valor.live).not.toBe(primeira.valor.live);
  });
});

describe('TransmissaoService — ligação com a configuração e o canal', () => {
  it('o canal recebe a StreamConfig do preset e os observadores anexados são notificados', async () => {
    const recebidos: string[] = [];
    const observador: IObserver = {
      id: 'obs-teste',
      name: 'Observador de teste',
      targetSystem: 'teste',
      update: (evento: StreamEvent) => {
        recebidos.push(evento.type);
      },
    };
    let resolucao: string | undefined;
    let latencia: string | undefined;
    const { servico } = montar({
      configurarCanal: (canal) => {
        canal.attach(observador);
        resolucao = canal.getStreamConfig()?.resolution;
        latencia = canal.getStreamConfig()?.latencyMode;
      },
    });
    const criador = sessao('usr_20');

    const aberta = await servico.abrir(criador, preset('Show', 'alta-qualidade'));
    if (!aberta.ok) throw new Error('abertura deveria funcionar');
    await servico.encerrar(criador, aberta.valor.live);

    expect(resolucao).toBe('R2160P');
    expect(latencia).toBe('STANDARD');
    expect(recebidos).toEqual(['STREAM_STARTED', 'STREAM_ENDED']);
  });

  it('falha ao abrir devolve FALHA_AO_ABRIR e libera o criador para tentar de novo', async () => {
    let tentativas = 0;
    const { servico, iniciadas } = montar({
      configurarCanal: () => {
        tentativas += 1;
        if (tentativas === 1) throw new Error('observador quebrado');
      },
    });
    const criador = sessao('usr_21');

    const primeira = await servico.abrir(criador, preset());
    const segunda = await servico.abrir(criador, preset());

    expect(primeira).toMatchObject({ ok: false, erro: { codigo: 'FALHA_AO_ABRIR', mensagem: 'observador quebrado' } });
    expect(segunda.ok).toBe(true);
    expect(iniciadas).toHaveLength(1);
  });
});
