import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compor } from '../src/composicao';
import { MENSAGEM_DOACAO, REPASSE_ESPERADO_CENTAVOS, VALOR_DOACAO, executarCA01 } from '../src/roteiro';

/**
 * Teste de ponta a ponta do CA-01 (live com doação destacada) com os módulos reais:
 * identidade, transmissão, conteúdo, monetização, chat e moderação, compostos por `compor()`.
 * O que se confere são os resultados observáveis de cada passo, não detalhes internos.
 *
 * Uma composição só: o hash de senha da identidade leva alguns segundos por composição.
 */
test('CA-01 completo, sem credenciais e sem fetch: os seis passos rodam nos módulos reais e os eventos saem em ordem', async () => {
  // Sem credenciais de gateway real (`compor` usa só o processador simulado) e sem nenhum `fetch`.
  const fetchOriginal = globalThis.fetch;
  let chamadasDeRede = 0;
  globalThis.fetch = (() => {
    chamadasDeRede++;
    return Promise.reject(new Error('rede indisponível no teste'));
  }) as typeof fetch;

  const linhas: string[] = [];
  let sistema;
  let r;
  try {
    sistema = await compor();
    r = await executarCA01(sistema, (linha) => linhas.push(linha));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  assert.equal(chamadasDeRede, 0);

  // Passo 1: login pela cadeia de verificações, com o papel de cada um e a falha como Resultado.
  assert.equal(r.sessaoCriador.papel, 'criador');
  assert.equal(r.sessaoEspectador.papel, 'espectador');
  assert.equal(r.errosDeLogin.senhaErrada, 'INVALID_CREDENTIALS');
  assert.equal(r.errosDeLogin.semSegundoFator, 'TOTP_REQUIRED');

  // Passo 2: o preset vira a configuração do Director, o canal usa uma estratégia de despacho,
  // o seguidor (Observer) é avisado e o conteúdo registra a LiveStream sem falhas.
  assert.equal(r.canal.resolucao, 'R720P');
  assert.ok(r.canal.estrategia.length > 0);
  assert.deepEqual(r.seguidorAposAbrir, ['STREAM_STARTED']);
  assert.deepEqual(sistema.conteudo.falhas, []);

  // Passo 3: o Proxy barra o aviso falsificado, credita o autêntico uma vez e ignora o reenvio.
  assert.deepEqual(r.avisos, { falsificado: 'NAO_AUTENTICO', autentico: 'CREDITADO', reenvio: 'DUPLICADO' });
  assert.ok(r.moedasCreditadas >= VALOR_DOACAO);

  // Passos 4 e 5: doação confirmada, repasse ao criador e destaque entregue ao chat moderado.
  assert.equal(r.comprovante.valor, VALOR_DOACAO);
  assert.equal(r.comprovante.destaqueEntregue, true);
  assert.equal(r.saldos.moedasEspectador, r.moedasCreditadas - VALOR_DOACAO);
  assert.equal(r.saldos.centavosCriador, REPASSE_ESPERADO_CENTAVOS);
  const destaque = r.entregues.find((e) => e.destacada);
  assert.equal(destaque?.mensagem.texto, MENSAGEM_DOACAO);

  // Passo 6: o VOD nasce da reação do conteúdo a LiveEncerrada, e a live deixa de existir.
  assert.equal(r.vod.processingStatus, 'PROCESSING');
  assert.equal((await sistema.transmissao.consultar(r.live)).ok, false);

  // Eventos: a ordem do cenário, uma vez cada.
  assert.deepEqual(r.eventos, [
    'LiveIniciada',
    'RecargaConcluida',
    'MensagemPublicada',
    'DoacaoConfirmada',
    'LiveEncerrada',
  ]);

  // Saída legível: um cabeçalho por passo, cada um dizendo o padrão em ação.
  for (let n = 1; n <= 6; n++) {
    assert.ok(linhas.some((l) => l.includes(`Passo ${n} —`)), `falta o passo ${n}`);
  }
  assert.equal(linhas.filter((l) => l.includes('Padrão em ação:')).length, 6);
});
