import type { PresetTransmissao } from '@g6/shared-kernel';
import { describe, expect, it } from 'vitest';
import { DefaultStreamConfigBuilder } from '../../src/configuracao/default-stream-config-builder';
import { LatencyMode, Resolution } from '../../src/configuracao/enums';
import { InvalidStreamConfigError } from '../../src/configuracao/errors';
import { criarConfiguracao } from '../../src/configuracao/presets';
import type { StreamConfigBuilder } from '../../src/configuracao/stream-config-builder';

describe('criarConfiguracao (PresetTransmissao → StreamConfigDirector)', () => {
  it.each<[PresetTransmissao['preset'], LatencyMode, Resolution, number, number]>([
    ['baixa-latencia', LatencyMode.LOW, Resolution.R720P, 30, 4_500_000],
    ['alta-qualidade', LatencyMode.STANDARD, Resolution.R2160P, 60, 20_000_000],
    ['movel', LatencyMode.STANDARD, Resolution.R480P, 30, 1_000_000],
  ])('o preset %s usa a receita do Director correspondente', (preset, latencia, resolucao, fps, bitrate) => {
    const config = criarConfiguracao({ preset, titulo: 'Minha live' });

    expect(config.title).toBe('Minha live');
    expect(config.latencyMode).toBe(latencia);
    expect(config.resolution).toBe(resolucao);
    expect(config.framesPerSecond).toBe(fps);
    expect(config.bitrateBps).toBe(bitrate);
  });

  it('aplica o trim do título, como o builder faz', () => {
    const config = criarConfiguracao({ preset: 'movel', titulo: '  Live de domingo  ' });

    expect(config.title).toBe('Live de domingo');
  });

  it('rejeita título vazio com a violação R1', () => {
    const chamada = () => criarConfiguracao({ preset: 'baixa-latencia', titulo: '   ' });

    expect(chamada).toThrow(InvalidStreamConfigError);
    expect(chamada).toThrow(/- R1 título é obrigatório/);
  });

  it.each(['inexistente', 'constructor', 'toString', 'hasOwnProperty'])(
    'rejeita o preset desconhecido %s com erro explícito',
    (nome) => {
      const pedido = { preset: nome, titulo: 'Live' } as unknown as PresetTransmissao;

      expect(() => criarConfiguracao(pedido)).toThrow(InvalidStreamConfigError);
      expect(() => criarConfiguracao(pedido)).toThrow(`preset desconhecido: ${nome}`);
    },
  );

  it('usa o builder recebido em vez de criar um próprio', () => {
    const real = new DefaultStreamConfigBuilder();
    const chamadas: string[] = [];
    const titulos: string[] = [];
    const espiao: StreamConfigBuilder = {
      withTitle: (t) => (chamadas.push('withTitle'), titulos.push(t), real.withTitle(t), espiao),
      withVisibility: (v) => (chamadas.push('withVisibility'), real.withVisibility(v), espiao),
      withLatencyMode: (l) => (chamadas.push('withLatencyMode'), real.withLatencyMode(l), espiao),
      withRecording: (e) => (chamadas.push('withRecording'), real.withRecording(e), espiao),
      withVideo: (r, f, b) => (chamadas.push('withVideo'), real.withVideo(r, f, b), espiao),
      reset: () => (chamadas.push('reset'), real.reset(), espiao),
      build: () => (chamadas.push('build'), real.build()),
    };

    const config = criarConfiguracao({ preset: 'alta-qualidade', titulo: 'Show' }, espiao);

    expect(chamadas[0]).toBe('reset');
    expect(chamadas).toContain('withTitle');
    expect(chamadas).toContain('withVideo');
    expect(chamadas.at(-1)).toBe('build');
    expect(titulos).toEqual(['Show']);
    expect(config.title).toBe('Show');
  });

  it('não vaza estado entre chamadas consecutivas', () => {
    const primeira = criarConfiguracao({ preset: 'alta-qualidade', titulo: 'Primeira' });
    const segunda = criarConfiguracao({ preset: 'baixa-latencia', titulo: 'Segunda' });

    expect(primeira.resolution).toBe(Resolution.R2160P);
    expect(segunda.resolution).toBe(Resolution.R720P);
    expect(segunda.latencyMode).toBe(LatencyMode.LOW);
  });
});
