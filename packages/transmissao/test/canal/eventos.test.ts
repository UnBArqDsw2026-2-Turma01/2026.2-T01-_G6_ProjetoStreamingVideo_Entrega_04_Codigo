import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBusEmMemoria, canalId, liveId, type EventoDe } from '@g6/shared-kernel';
import {
  StreamChannel,
  AsynchronousConcurrentDispatchStrategy,
  SimulatedFollowerObserver,
  type StreamConfigCanal,
} from '../../src/canal/index.js';

describe('StreamChannel com StreamConfig e EventBus', () => {
  it('recebe StreamConfig pronta na abertura e publica LiveIniciada e LiveEncerrada no EventBusEmMemoria', async () => {
    const eventBus = new EventBusEmMemoria();
    const iniciadas: Array<EventoDe<'LiveIniciada'>> = [];
    const encerradas: Array<EventoDe<'LiveEncerrada'>> = [];

    eventBus.assinar('LiveIniciada', (ev: EventoDe<'LiveIniciada'>) => iniciadas.push(ev));
    eventBus.assinar('LiveEncerrada', (ev: EventoDe<'LiveEncerrada'>) => encerradas.push(ev));

    const configPronta: StreamConfigCanal = {
      title: 'Live de Arquitetura CA-01',
      visibility: 'PUBLIC',
      latencyMode: 'LOW',
      recordAutomatically: true,
      resolution: 'R1080P',
      framesPerSecond: 60,
      bitrateBps: 6_000_000,
    };

    const channel = new StreamChannel(
      'canal_edu',
      'Eduardo',
      'TWITCH',
      'Software Engineering',
      new AsynchronousConcurrentDispatchStrategy(),
      eventBus,
    );
    channel.attach(new SimulatedFollowerObserver('obs-seg-1', 'Seguidor 1', 1, 0));

    const idEsperado = liveId('live_ca01_1');
    const report = await channel.goLive(configPronta, 'Tech', ['arq', 'ts'], 42, idEsperado);

    assert.equal(report.successful, 1);
    assert.equal(channel.getStatus(), 'LIVE');
    assert.equal(channel.getMetadata().title, 'Live de Arquitetura CA-01');
    assert.equal(channel.getStreamConfig(), configPronta);
    assert.equal(channel.getActiveLiveId(), idEsperado);

    assert.equal(iniciadas.length, 1);
    assert.equal(iniciadas[0].tipo, 'LiveIniciada');
    assert.equal(iniciadas[0].live, idEsperado);
    assert.equal(iniciadas[0].canal, canalId('canal_edu'));
    assert.ok(iniciadas[0].em instanceof Date);

    await channel.endLive();

    assert.equal(channel.getStatus(), 'OFFLINE');
    assert.equal(channel.getActiveLiveId(), undefined);
    assert.equal(encerradas.length, 1);
    assert.equal(encerradas[0].tipo, 'LiveEncerrada');
    assert.equal(encerradas[0].live, idEsperado);
    assert.equal(encerradas[0].canal, canalId('canal_edu'));
    assert.ok(encerradas[0].em instanceof Date);
  });

  it('aceita StreamConfig no construtor e abre live com goLive() sem remontar config', async () => {
    const eventBus = new EventBusEmMemoria();
    const iniciadas: Array<EventoDe<'LiveIniciada'>> = [];
    eventBus.assinar('LiveIniciada', (ev: EventoDe<'LiveIniciada'>) => iniciadas.push(ev));

    const configPronta: StreamConfigCanal = {
      title: 'Preset Alta Qualidade',
      latencyMode: 'STANDARD',
      recordAutomatically: true,
    };

    const channel = new StreamChannel(
      'canal_preset',
      'Criador Preset',
      'YOUTUBE_LIVE',
      'Just Chatting',
      new AsynchronousConcurrentDispatchStrategy(),
      eventBus,
      configPronta,
    );

    assert.equal(channel.getMetadata().title, 'Preset Alta Qualidade');
    await channel.goLive();

    assert.equal(channel.getStatus(), 'LIVE');
    assert.equal(iniciadas.length, 1);
    assert.equal(iniciadas[0].canal, canalId('canal_preset'));
  });
});
