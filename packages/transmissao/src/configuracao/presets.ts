import type { PresetTransmissao } from '@g6/shared-kernel';
import { DefaultStreamConfigBuilder } from './default-stream-config-builder';
import { InvalidStreamConfigError } from './errors';
import type { StreamConfig } from './stream-config';
import type { StreamConfigBuilder } from './stream-config-builder';
import { StreamConfigDirector } from './stream-config-director';

type NomeDoPreset = PresetTransmissao['preset'];

/**
 * Liga o vocabulário do contrato (`PresetTransmissao`, em português) às receitas do
 * Director (em inglês, como vieram da E03).
 *
 * É um `Record` e não um `switch` de propósito: se o shared-kernel ganhar um preset
 * novo, o typecheck quebra aqui até alguém decidir qual receita do Director o atende.
 */
const RECEITA: Record<NomeDoPreset, (director: StreamConfigDirector, titulo: string) => StreamConfig> = {
  'baixa-latencia': (director, titulo) => director.lowLatency(titulo),
  'alta-qualidade': (director, titulo) => director.highQuality(titulo),
  movel: (director, titulo) => director.mobile(titulo),
};

/**
 * Monta o `StreamConfig` pedido pelo `TransmissaoPort.abrir`.
 *
 * Lança `InvalidStreamConfigError` se o título for vazio (regra R1 do ADR-001, validada
 * no `build()` do builder) ou se o preset não existir. Converter essa exceção em
 * `Resultado` é papel do `TransmissaoPort` (#8), que é quem fala com os outros módulos.
 *
 * O builder é parâmetro para os testes poderem injetar um dublê; por padrão cada
 * chamada usa um builder novo, então nenhum estado vaza entre as lives.
 */
export function criarConfiguracao(
  pedido: PresetTransmissao,
  builder: StreamConfigBuilder = new DefaultStreamConfigBuilder(),
): StreamConfig {
  // O tipo só protege em tempo de compilação; o pedido pode chegar de `apps/*` sem checagem.
  // `hasOwn` evita que nomes herdados do Object ('constructor', 'toString') virem receita.
  if (!Object.hasOwn(RECEITA, pedido.preset)) {
    throw new InvalidStreamConfigError([`preset desconhecido: ${String(pedido.preset)}`]);
  }
  return RECEITA[pedido.preset](new StreamConfigDirector(builder), pedido.titulo);
}
