import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { usuarioId, type MensagemChat, type MensagemDestacada } from '@g6/shared-kernel';
import {
  AutoModPipelineConcreto,
  EstrategiaToxicidade,
  ModeracaoService,
  TextEntropyAnalyzer,
} from '../src/index.js';

function criarMensagem(texto: string): MensagemChat {
  return {
    id: 'msg_test_1',
    autor: usuarioId('usr_1'),
    nomeAutor: 'Espectador',
    texto,
    em: new Date('2026-11-16T10:00:00Z'),
  };
}

describe('ModeracaoService e estrategias do AutoMod', () => {
  it('detecta e bloqueia evasão por leetspeak usando TextEntropyAnalyzer', async () => {
    const service = new ModeracaoService();
    const veredito = await service.avaliar(criarMensagem('use h@ck e a1mb0t agora'));

    assert.equal(veredito.decisao, 'bloqueada');
    assert.ok(veredito.motivo.length > 0);
  });

  it('coloca em quarentena spam repetitivo de baixa entropia de Shannon', async () => {
    const service = new ModeracaoService();
    const textoRepetitivo = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const analise = TextEntropyAnalyzer.analyze(textoRepetitivo);

    assert.equal(analise.entropy, 0);
    assert.equal(analise.isSpam, true);

    const veredito = await service.avaliar(criarMensagem(textoRepetitivo));
    assert.equal(veredito.decisao, 'quarentena');
  });

  it('bloqueia links suspeitos de phishing', async () => {
    const service = new ModeracaoService();
    const veredito = await service.avaliar(
      criarMensagem('resgate free-robux.site agora em http://phish.test e http://outro.test')
    );

    assert.equal(veredito.decisao, 'bloqueada');
  });

  it('aceita MensagemDestacada sem alterar a entrada', async () => {
    const service = new ModeracaoService();
    const destacada: MensagemDestacada = {
      id: 'msg_dest_1',
      autor: usuarioId('usr_doador'),
      nomeAutor: 'Apoiador',
      texto: 'Parabéns pela live de hoje!',
      em: new Date('2026-11-16T10:05:00Z'),
      valor: 50,
      cor: '#FFD700',
      tempoFixacaoMin: 5,
    };

    const veredito = await service.avaliar(destacada);
    assert.equal(veredito.decisao, 'aprovada');
    assert.equal(destacada.texto, 'Parabéns pela live de hoje!');
  });

  it('permite trocar estratégias no pipeline do AutoMod', async () => {
    const pipeline = new AutoModPipelineConcreto([new EstrategiaToxicidade()]);
    const service = new ModeracaoService(pipeline);

    const antes = await service.avaliar(criarMensagem('Veja http://exemplo.com'));
    assert.equal(antes.decisao, 'aprovada');

    const toxico = await service.avaliar(criarMensagem('Seu palavrão'));
    assert.equal(toxico.decisao, 'bloqueada');
  });
});
