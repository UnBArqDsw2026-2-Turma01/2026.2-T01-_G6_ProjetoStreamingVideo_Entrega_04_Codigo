import assert from 'node:assert/strict';
import type { EventBus, EventoDominio } from '../../eventos';
import { canalId, liveId } from '../../tipos';

export function casosEventBus(criarSut: () => EventBus) {
  return [
    {
      nome: 'Deve entregar o evento aos assinantes do mesmo tipo, em ordem',
      executar: () => {
        const sut = criarSut();
        const entregas: string[] = [];
        const eventoFake: EventoDominio = {
          tipo: 'LiveIniciada',
          live: liveId('1'),
          canal: canalId('2'),
          em: new Date(),
        };

        sut.assinar('LiveIniciada', () => entregas.push('a'));
        sut.assinar('LiveIniciada', () => entregas.push('b'));
        sut.assinar('DoacaoConfirmada', () => entregas.push('nunca'));

        sut.publicar(eventoFake);

        assert.deepEqual(entregas, ['a', 'b']);
      },
    },
    {
      nome: 'Deve cancelar a assinatura corretamente',
      executar: () => {
        const sut = criarSut();
        let chamadas = 0;
        const eventoFake: EventoDominio = {
          tipo: 'LiveEncerrada',
          live: liveId('1'),
          canal: canalId('2'),
          em: new Date(),
        };

        const cancelar = sut.assinar('LiveEncerrada', () => chamadas++);
        sut.publicar(eventoFake);
        assert.equal(chamadas, 1);

        cancelar();
        sut.publicar(eventoFake);
        assert.equal(chamadas, 1);
      },
    },
    {
      nome: 'Deve entregar eventos publicados durante o tratamento depois do evento atual',
      executar: () => {
        const sut = criarSut();
        const entregas: string[] = [];
        const evento = (id: string): EventoDominio => ({ tipo: 'LiveIniciada', live: liveId(id), canal: canalId('c'), em: new Date() });

        sut.assinar('LiveIniciada', (e) => {
          entregas.push(`a:${e.live}`);
          if (e.live === '1') sut.publicar(evento('2'));
        });
        sut.assinar('LiveIniciada', (e) => entregas.push(`b:${e.live}`));

        sut.publicar(evento('1'));
        assert.deepEqual(entregas, ['a:1', 'b:1', 'a:2', 'b:2']);
      },
    },
    {
      nome: 'Deve entregar aos demais assinantes mesmo quando um tratador falha',
      executar: () => {
        const sut = criarSut();
        const entregas: string[] = [];
        const evento = (id: string): EventoDominio => ({ tipo: 'LiveIniciada', live: liveId(id), canal: canalId('c'), em: new Date() });

        sut.assinar('LiveIniciada', (e) => {
          if (e.live === '1') {
            sut.publicar(evento('2'));
            throw new Error('falha no tratador');
          }
        });
        sut.assinar('LiveIniciada', (e) => entregas.push(`b:${e.live}`));

        assert.throws(() => sut.publicar(evento('1')));
        assert.deepEqual(entregas, ['b:1', 'b:2']);
      },
    },
  ];
}
