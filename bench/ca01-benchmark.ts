import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConteudoDeLive } from '@g6/conteudo';
import { pacoteId, type MensagemEntregue } from '@g6/shared-kernel';
import { criarConfiguracao } from '../packages/transmissao/src/configuracao/index';
import { compor } from '../apps/web/src/ca01';

interface Estatisticas {
  readonly repeticoes: number;
  readonly aquecimentoDescartado: number;
  readonly minMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly mediaMs: number;
}

interface ResultadoChatN {
  readonly inscritos: number;
  readonly estatisticas: Estatisticas;
  readonly entregasPorSegundoP50: number;
}

function percentil(ordenadas: readonly number[], p: number): number {
  if (ordenadas.length === 0) return 0;
  const indice = Math.ceil((p / 100) * ordenadas.length) - 1;
  return ordenadas[Math.max(0, Math.min(ordenadas.length - 1, indice))];
}

function resumir(amostrasMs: readonly number[], aquecimentoDescartado: number): Estatisticas {
  const ordenadas = [...amostrasMs].sort((a, b) => a - b);
  const soma = ordenadas.reduce((acc, v) => acc + v, 0);
  const arredondar = (v: number) => Number(v.toFixed(4));

  return {
    repeticoes: ordenadas.length,
    aquecimentoDescartado,
    minMs: arredondar(ordenadas[0]),
    p50Ms: arredondar(percentil(ordenadas, 50)),
    p95Ms: arredondar(percentil(ordenadas, 95)),
    p99Ms: arredondar(percentil(ordenadas, 99)),
    maxMs: arredondar(ordenadas[ordenadas.length - 1]),
    mediaMs: arredondar(soma / ordenadas.length),
  };
}

async function executarFluxoCA01Completo(): Promise<void> {
  const servico = compor();
  const conteudo = new ConteudoDeLive({
    eventos: servico.bus,
    transmissao: servico.portas.transmissao,
  });
  const cancelarConteudo = conteudo.assinar();

  try {
    const criador = servico.sessaoDemo('criador');
    const espectador = servico.sessaoDemo('espectador');

    const config = criarConfiguracao({
      preset: 'alta-qualidade',
      titulo: 'Live Benchmark CA-01',
    });
    const abertura = await servico.abrirLive(criador, {
      preset: 'alta-qualidade',
      titulo: config.title,
    });
    if (!abertura.ok) throw new Error(`Falha ao abrir live: ${abertura.erro.codigo}`);
    const live = abertura.valor.live;

    const checkout = await servico.recarregar(espectador, pacoteId('p30'), 'simulado');
    if (!checkout.ok) throw new Error(`Falha na recarga: ${checkout.erro.codigo}`);

    const confirmacao = await servico.confirmarRecarga(espectador, checkout.valor.recargaId);
    if (!confirmacao.ok) throw new Error(`Falha ao confirmar recarga: ${confirmacao.erro.codigo}`);

    let destaqueRecebido = false;
    const cancelarChat = servico.portas.chat.inscrever(live, (msg: MensagemEntregue) => {
      if (msg.destacada) destaqueRecebido = true;
    });

    const doacao = await servico.doar(espectador, live, 500, 'Boa transmissao!');
    if (!doacao.ok || !destaqueRecebido) {
      throw new Error('Falha na doacao destacada durante benchmark CA-01');
    }

    const msgChat = await servico.enviarMensagem(espectador, live, 'Salve chat!');
    if (!msgChat.ok) throw new Error(`Falha ao enviar chat: ${msgChat.erro.codigo}`);

    cancelarChat();

    const encerramento = await servico.encerrarLive(criador, live);
    if (!encerramento.ok) throw new Error(`Falha ao encerrar live: ${encerramento.erro.codigo}`);

    await conteudo.ocioso();
    const vod = await conteudo.gravacaoDe(live);
    if (!vod) throw new Error('VOD nao foi gerado pelo @g6/conteudo apos LiveEncerrada');
  } finally {
    cancelarConteudo();
  }
}

async function medirCA01PontaAPonta(aquecimento: number, repeticoes: number): Promise<{
  amostrasMs: number[];
  estatisticas: Estatisticas;
}> {
  for (let i = 0; i < aquecimento; i++) {
    await executarFluxoCA01Completo();
  }

  const amostrasMs: number[] = [];
  for (let i = 0; i < repeticoes; i++) {
    const inicio = process.hrtime.bigint();
    await executarFluxoCA01Completo();
    const fim = process.hrtime.bigint();
    amostrasMs.push(Number(fim - inicio) / 1_000_000);
  }

  return {
    amostrasMs,
    estatisticas: resumir(amostrasMs, aquecimento),
  };
}

async function medirEntregaComNInscritos(
  tamanhos: readonly number[],
  aquecimento: number,
  repeticoes: number,
): Promise<{
  resultados: ResultadoChatN[];
  amostrasPorN: Record<number, number[]>;
}> {
  const resultados: ResultadoChatN[] = [];
  const amostrasPorN: Record<number, number[]> = {};

  for (const n of tamanhos) {
    const servico = compor();
    const criador = servico.sessaoDemo('criador');
    const espectador = servico.sessaoDemo('espectador');

    const abertura = await servico.abrirLive(criador, {
      preset: 'baixa-latencia',
      titulo: `Benchmark Chat N=${n}`,
    });
    if (!abertura.ok) throw new Error('Falha ao abrir live no benchmark de chat');
    const live = abertura.valor.live;

    const totalIteracoes = aquecimento + repeticoes;
    const recargasNecessarias = Math.ceil((totalIteracoes * 500) / 28000) + 1;
    for (let r = 0; r < recargasNecessarias; r++) {
      const c = await servico.recarregar(espectador, pacoteId('p1000'), 'simulado');
      if (!c.ok) throw new Error('Falha na recarga preparatoria');
      const conf = await servico.confirmarRecarga(espectador, c.valor.recargaId);
      if (!conf.ok) throw new Error('Falha na confirmacao preparatoria');
    }

    let entreguesNaRodada = 0;
    const cancelamentos = Array.from({ length: n }, () =>
      servico.portas.chat.inscrever(live, (msg) => {
        if (msg.destacada) entreguesNaRodada++;
      }),
    );

    const chatComHistorico = servico.portas.chat as { chamadas?: unknown[] };
    const doacaoComHistorico = servico.portas.doacao as { chamadas?: unknown[] };

    for (let i = 0; i < aquecimento; i++) {
      entreguesNaRodada = 0;
      const r = await servico.doar(espectador, live, 500, 'Aquecimento');
      if (!r.ok || entreguesNaRodada !== n) {
        throw new Error(`Falha no aquecimento N=${n}: entregues=${entreguesNaRodada}`);
      }
      if (chatComHistorico.chamadas) chatComHistorico.chamadas.length = 0;
      if (doacaoComHistorico.chamadas) doacaoComHistorico.chamadas.length = 0;
    }

    const amostrasMs: number[] = [];
    for (let i = 0; i < repeticoes; i++) {
      entreguesNaRodada = 0;
      const inicio = process.hrtime.bigint();
      const r = await servico.doar(espectador, live, 500, 'Mensagem destacada CA-01');
      const fim = process.hrtime.bigint();

      if (!r.ok || entreguesNaRodada !== n) {
        throw new Error(`Falha na medicao N=${n}: entregues=${entreguesNaRodada}`);
      }
      amostrasMs.push(Number(fim - inicio) / 1_000_000);

      if (chatComHistorico.chamadas) chatComHistorico.chamadas.length = 0;
      if (doacaoComHistorico.chamadas) doacaoComHistorico.chamadas.length = 0;
    }

    for (const cancelar of cancelamentos) cancelar();

    const estatisticas = resumir(amostrasMs, aquecimento);
    const entregasPorSegundoP50 = Number(((n / estatisticas.p50Ms) * 1000).toFixed(0));

    resultados.push({
      inscritos: n,
      estatisticas,
      entregasPorSegundoP50,
    });
    amostrasPorN[n] = amostrasMs;
  }

  return { resultados, amostrasPorN };
}

function formatarRelatorioMarkdown(dados: {
  ambiente: Record<string, unknown>;
  ca01: Estatisticas;
  chat: readonly ResultadoChatN[];
}): string {
  const { ambiente, ca01, chat } = dados;
  const linhasChat = chat
    .map(
      (item) =>
        `| ${item.inscritos} | ${item.estatisticas.aquecimentoDescartado} | ${item.estatisticas.repeticoes} | ${item.estatisticas.p50Ms.toFixed(4)} | ${item.estatisticas.p95Ms.toFixed(4)} | ${item.estatisticas.p99Ms.toFixed(4)} | ${item.estatisticas.mediaMs.toFixed(4)} | ${item.entregasPorSegundoP50} |`,
    )
    .join('\n');

  return `# Benchmark do CA-01 integrado (extra E8)

- **Data:** ${ambiente.executadoEm}
- **CPU:** ${ambiente.cpuModelo} (${ambiente.cpusLogicos} threads logicas)
- **Sistema:** ${ambiente.plataforma} ${ambiente.release} (${ambiente.arquitetura})
- **Node.js:** ${ambiente.nodeVersao}
- **Comando:** \`${ambiente.comando}\`

## Composicao medida

- **Reais:** \`EventBusEmMemoria\` (\`@g6/shared-kernel\`), \`criarConfiguracao\` (\`@g6/transmissao\`), \`ConteudoDeLive\` e \`InMemoryContentRepository\` (\`@g6/conteudo\`), orquestracao \`ServicoCA01\` (\`apps/web/src/ca01.ts\`).
- **Fakes do contrato:** \`FakeAutenticacao\`, \`FakeTransmissao\`, \`RecargaDemo\`/\`FakeRecarga\`, \`FakeDoacao\`, \`FakeChat\` e \`FakeModeracao\`, pois as issues \`#5\`, \`#7\`, \`#8\`, \`#13\`, \`#14\` e \`#15\` ainda nao entraram na \`main\`.

## 1. Latencia do CA-01 ponta a ponta

| Aquecimento | Repeticoes | Min (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Media (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ${ca01.aquecimentoDescartado} | ${ca01.repeticoes} | ${ca01.minMs.toFixed(4)} | ${ca01.p50Ms.toFixed(4)} | ${ca01.p95Ms.toFixed(4)} | ${ca01.p99Ms.toFixed(4)} | ${ca01.maxMs.toFixed(4)} | ${ca01.mediaMs.toFixed(4)} |

## 2. Entrega da mensagem destacada com N inscritos no chat

| Inscritos (N) | Aquecimento | Repeticoes | p50 (ms) | p95 (ms) | p99 (ms) | Media (ms) | Entregas/s (p50) |
| --- | --- | --- | --- | --- | --- | --- | --- |
${linhasChat}
`;
}

async function principal(): Promise<void> {
  const cpus = os.cpus();
  const ambiente = {
    executadoEm: new Date().toISOString(),
    nodeVersao: process.version,
    plataforma: os.platform(),
    release: os.release(),
    arquitetura: os.arch(),
    cpuModelo: cpus[0]?.model ?? 'desconhecida',
    cpusLogicos: cpus.length,
    memoriaTotalMB: Math.round(os.totalmem() / (1024 * 1024)),
    comando: 'npx tsx bench/ca01-benchmark.ts',
    composicao: {
      reais: ['@g6/shared-kernel (EventBusEmMemoria)', '@g6/transmissao (criarConfiguracao)', '@g6/conteudo (ConteudoDeLive)', 'apps/web (ServicoCA01)'],
      fakes: ['FakeAutenticacao', 'FakeTransmissao', 'RecargaDemo', 'FakeDoacao', 'FakeChat', 'FakeModeracao'],
    },
  };

  const ca01 = await medirCA01PontaAPonta(100, 1000);
  const chat = await medirEntregaComNInscritos([10, 100, 1000, 5000], 50, 300);

  const pastaResultados = path.resolve(process.cwd(), 'bench/resultados');
  mkdirSync(pastaResultados, { recursive: true });

  const csvCA01 = ['iteracao,latencia_ms', ...ca01.amostrasMs.map((v, i) => `${i + 1},${v.toFixed(6)}`)].join('\n');
  writeFileSync(path.join(pastaResultados, 'ca01-latencia-brutos.csv'), `${csvCA01}\n`, 'utf8');

  const linhasCsvChat = ['inscritos,iteracao,latencia_ms'];
  for (const [n, amostras] of Object.entries(chat.amostrasPorN)) {
    amostras.forEach((v, i) => linhasCsvChat.push(`${n},${i + 1},${v.toFixed(6)}`));
  }
  writeFileSync(path.join(pastaResultados, 'ca01-chat-brutos.csv'), `${linhasCsvChat.join('\n')}\n`, 'utf8');

  const resumoJson = {
    ambiente,
    ca01PontaAPonta: ca01.estatisticas,
    chatComNInscritos: chat.resultados,
  };
  writeFileSync(path.join(pastaResultados, 'resumo.json'), `${JSON.stringify(resumoJson, null, 2)}\n`, 'utf8');

  const relatorioMd = formatarRelatorioMarkdown({
    ambiente,
    ca01: ca01.estatisticas,
    chat: chat.resultados,
  });
  writeFileSync(path.join(pastaResultados, 'relatorio.md'), relatorioMd, 'utf8');

  console.log(relatorioMd);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
