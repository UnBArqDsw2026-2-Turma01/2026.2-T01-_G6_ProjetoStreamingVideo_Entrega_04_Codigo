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
  ];
}