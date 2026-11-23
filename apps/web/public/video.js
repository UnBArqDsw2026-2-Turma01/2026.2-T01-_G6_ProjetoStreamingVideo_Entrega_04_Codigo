// Câmera da live (WebRTC). Sem dependências nem build; a sinalização está em src/video.ts.
//   criador:   liga a câmera ou compartilha a tela (com a webcam por cima, se quiser), mostra a prévia,
//              grava para o VOD e responde às ofertas dos espectadores;
//   espectador: pergunta se a câmera está ligada, pede o vídeo ao criador e exibe o que chegar.
import { criarComposicao, LARGURA, ALTURA } from '/composicao.js';
import { criarGravador } from '/gravacao.js';

const INTERVALO_CRIADOR_MS = 1000;
const INTERVALO_ESPECTADOR_MS = 1500;
const ESPERA_ICE_MS = 2500;
const ESPERA_RESPOSTA_MS = 15000;

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Espera o navegador terminar de coletar os candidatos ICE (sem "trickle", a sinalização fica em 1 ida e volta). */
function esperarIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolver) => {
    const fim = () => { pc.removeEventListener('icegatheringstatechange', verificar); resolver(); };
    const verificar = () => { if (pc.iceGatheringState === 'complete') fim(); };
    pc.addEventListener('icegatheringstatechange', verificar);
    setTimeout(fim, ESPERA_ICE_MS);
  });
}

const novaConexao = () => new RTCPeerConnection({ iceServers: [] });

function mensagemDeErro(erro) {
  switch (erro?.name) {
    case 'NotAllowedError': return 'Permissão negada. Libere a câmera no navegador (cadeado ao lado do endereço) e tente de novo.';
    case 'NotFoundError': return 'Nenhuma câmera encontrada. Use "Compartilhar tela" ou conecte uma câmera.';
    case 'NotReadableError': return 'A câmera está em uso por outro programa.';
    case 'SecurityError': return 'O navegador só libera a câmera em http://localhost ou HTTPS.';
    default: return erro?.message || 'Não foi possível acessar a câmera.';
  }
}

export function criarVideo({ estado, api, avisar, $ }) {
  const tela = $('#video-live');
  const aviso = $('#aviso-video');
  const botaoSom = $('#ativar-som');
  const botaoCamera = $('#camera-ligar');
  const botaoTela = $('#tela-ligar');
  const botaoParar = $('#camera-parar');
  const painelWebcam = $('#controles-webcam');
  const botaoWebcam = $('#webcam-alternar');
  const opcoesWebcam = $('#webcam-opcoes');
  const gravador = criarGravador({ estado });

  const criador = { stream: null, live: null, tempo: null, conexoes: new Map(), ocupado: false, composicao: null };
  const espectador = { live: null, versao: null, pc: null, tempo: null, ocupado: false, tentativa: 0 };

  function mostrarAviso(texto) {
    aviso.textContent = texto || '';
    aviso.hidden = !texto;
  }
  // `comControleDeSom`: o espectador começa mudo (exigência do autoplay) e liga o som no botão;
  // a prévia do criador fica sempre muda, para não gerar eco.
  function mostrarVideo(stream, comControleDeSom = false) {
    if (tela.srcObject !== stream) {
      tela.srcObject = stream;
      tela.muted = true;
      botaoSom.textContent = 'Ativar som';
    }
    tela.hidden = !stream;
    botaoSom.hidden = !stream || !comControleDeSom || !stream.getAudioTracks().length;
    if (stream) tela.play().catch(() => {});
  }

  // ---------------- criador ----------------
  async function capturar(tipo) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error(), { name: 'SecurityError' });
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
    } catch (erro) {
      if (erro?.name === 'NotFoundError' || erro?.name === 'OverconstrainedError') {
        // Sem microfone: transmite só a imagem.
        return navigator.mediaDevices.getUserMedia({ video: true });
      }
      throw erro;
    }
  }

  async function atender(live, oferta) {
    const pc = novaConexao();
    criador.conexoes.set(oferta.id, pc);
    pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { pc.close(); criador.conexoes.delete(oferta.id); }
    });
    try {
      for (const faixa of criador.stream.getTracks()) pc.addTrack(faixa, criador.stream);
      await pc.setRemoteDescription({ type: 'offer', sdp: oferta.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await esperarIce(pc);
      await api('POST', `/api/lives/${live}/video/respostas`, { id: oferta.id, sdp: pc.localDescription.sdp });
    } catch {
      pc.close();
      criador.conexoes.delete(oferta.id);
    }
  }

  async function consultar() {
    if (criador.ocupado || !criador.stream) return;
    criador.ocupado = true;
    try {
      const { ofertas } = await api('GET', `/api/lives/${criador.live}/video/ofertas`);
      await Promise.all(ofertas.map((o) => atender(criador.live, o)));
    } catch (erro) {
      // Live encerrada em outra aba ou servidor reiniciado: a prévia não faz mais sentido.
      if (/não encontrada|encerrada|Entre|Só o criador/i.test(erro.message)) { await desligar(false); avisar(erro.message); }
    } finally {
      criador.ocupado = false;
    }
  }

  /** Tela inteira/janela/aba. A webcam entra por cima depois, pelo botão "Adicionar webcam". */
  async function capturarTela() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw Object.assign(new Error(), { name: 'SecurityError' });
    const tela = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    const composicao = criarComposicao();
    composicao.definirTela(tela);
    return { composicao, stream: composicao.stream, origem: tela };
  }

  async function ligar(tipo) {
    if (!estado.live) return avisar('Abra a live antes de ligar a câmera.');
    if (criador.stream) await desligar();
    let stream;
    let composicao = null;
    let origem;
    try {
      if (tipo === 'tela') ({ stream, composicao, origem } = await capturarTela());
      else origem = stream = await capturar(tipo);
    } catch (erro) {
      return avisar(mensagemDeErro(erro));
    }
    try {
      await api('POST', `/api/lives/${estado.live.live}/video/camera`, { ativa: true });
    } catch (erro) {
      composicao?.encerrar();
      stream.getTracks().forEach((f) => f.stop());
      return avisar(erro.message);
    }
    Object.assign(criador, { stream, live: estado.live.live, composicao });
    // Se o navegador (ou o usuário, no compartilhamento de tela) encerrar a captura, desliga tudo.
    origem.getVideoTracks()[0]?.addEventListener('ended', () => desligar());
    gravador.iniciar(stream, estado.live.live);
    mostrarVideo(stream);
    mostrarAviso('');
    clearInterval(criador.tempo);
    criador.tempo = setInterval(consultar, INTERVALO_CRIADOR_MS);
    atualizarBotoes();
    avisar(tipo === 'tela' ? 'Tela sendo transmitida' : 'Câmera ligada: os espectadores já veem sua imagem', true);
  }

  async function desligar(avisarServidor = true) {
    clearInterval(criador.tempo);
    criador.tempo = null;
    const { composicao, live, stream } = criador;
    Object.assign(criador, { stream: null, live: null, composicao: null });
    await gravador.parar(); // envia o último pedaço antes de soltar a câmera
    composicao?.encerrar();
    stream?.getTracks().forEach((f) => f.stop());
    criador.conexoes.forEach((pc) => pc.close());
    criador.conexoes.clear();
    mostrarVideo(null);
    if (avisarServidor && live) await api('POST', `/api/lives/${live}/video/camera`, { ativa: false }).catch(() => {});
    atualizarBotoes();
    sincronizar(estado.live);
  }

  // ---------------- webcam sobre a tela ----------------
  async function alternarWebcam() {
    const comp = criador.composicao;
    if (!comp) return;
    if (comp.temWebcam()) {
      comp.definirWebcam(null);
    } else {
      try {
        let cam;
        try { cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } }, audio: true }); }
        catch (erro) {
          if (erro?.name !== 'NotFoundError' && erro?.name !== 'OverconstrainedError') throw erro;
          cam = await navigator.mediaDevices.getUserMedia({ video: true }); // sem microfone
        }
        comp.definirWebcam(cam);
        cam.getVideoTracks()[0]?.addEventListener('ended', () => { comp.definirWebcam(null); atualizarBotoes(); });
      } catch (erro) {
        avisar(mensagemDeErro(erro));
      }
    }
    atualizarBotoes();
  }

  // Arrastar a webcam direto na prévia: o ponteiro move o centro dela dentro do quadro 16:9.
  function pontoNoQuadro(evento) {
    const caixa = tela.getBoundingClientRect();
    const proporcao = LARGURA / ALTURA;
    let largura = caixa.width;
    let altura = caixa.height;
    if (largura / altura > proporcao) largura = altura * proporcao; else altura = largura / proporcao;
    const x0 = caixa.left + (caixa.width - largura) / 2;
    const y0 = caixa.top + (caixa.height - altura) / 2;
    return [(evento.clientX - x0) / largura, (evento.clientY - y0) / altura];
  }
  let arrastando = false;
  tela.addEventListener('pointerdown', (e) => {
    const comp = criador.composicao;
    if (!comp?.temWebcam() || !comp.sobreWebcam(...pontoNoQuadro(e))) return;
    arrastando = true;
    tela.setPointerCapture(e.pointerId);
    tela.classList.add('arrastando');
    e.preventDefault();
  });
  tela.addEventListener('pointermove', (e) => {
    const comp = criador.composicao;
    if (!comp?.temWebcam()) return;
    if (arrastando) comp.centralizarEm(...pontoNoQuadro(e));
    else tela.classList.toggle('sobre-webcam', comp.sobreWebcam(...pontoNoQuadro(e)));
  });
  const soltar = () => { arrastando = false; tela.classList.remove('arrastando'); };
  tela.addEventListener('pointerup', soltar);
  tela.addEventListener('pointercancel', soltar);

  botaoWebcam.addEventListener('click', alternarWebcam);
  painelWebcam.querySelectorAll('[data-canto]').forEach((b) => b.addEventListener('click', () => criador.composicao?.irParaCanto(b.dataset.canto)));
  $('#webcam-tamanho').addEventListener('change', (e) => criador.composicao?.definirTamanho(e.target.value));

  // ---------------- espectador ----------------
  function fecharEspectador() {
    espectador.pc?.close();
    espectador.pc = null;
    espectador.versao = null;
    if (!criador.stream) mostrarVideo(null);
  }

  async function conectar(live, versao) {
    const tentativa = ++espectador.tentativa;
    const pc = novaConexao();
    Object.assign(espectador, { pc, versao });
    const cancelada = () => tentativa !== espectador.tentativa || espectador.pc !== pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.addEventListener('track', (e) => { if (!cancelada()) { mostrarVideo(e.streams[0], true); mostrarAviso(''); } });
    pc.addEventListener('connectionstatechange', () => {
      // Refaz a conexão no próximo ciclo se ela cair.
      if (!cancelada() && ['failed', 'closed'].includes(pc.connectionState)) fecharEspectador();
    });
    mostrarAviso('Conectando à câmera…');
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await esperarIce(pc);
      const { id } = await api('POST', `/api/lives/${live}/video/ofertas`, { sdp: pc.localDescription.sdp });
      const limite = Date.now() + ESPERA_RESPOSTA_MS;
      while (!cancelada() && Date.now() < limite) {
        const r = await api('GET', `/api/lives/${live}/video/respostas/${id}`);
        if (r.pronta) {
          await pc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
          return;
        }
        await esperar(500);
      }
      if (!cancelada()) throw new Error('sem resposta do criador');
    } catch {
      if (!cancelada()) { fecharEspectador(); mostrarAviso('Reconectando à câmera…'); }
    }
  }

  async function verificar() {
    if (espectador.ocupado || criador.stream || !espectador.live || estado.papel === 'criador') return;
    espectador.ocupado = true;
    try {
      const { ativa, versao } = await api('GET', `/api/lives/${espectador.live}/video/estado`);
      if (!ativa) {
        if (espectador.pc || tela.srcObject) fecharEspectador();
        mostrarAviso('Aguardando o criador ligar a câmera…');
      } else if (!espectador.pc || espectador.versao !== versao) {
        espectador.pc?.close();
        await conectar(espectador.live, versao);
      }
    } catch { /* tenta no próximo ciclo */ } finally {
      espectador.ocupado = false;
    }
  }

  // ---------------- integração com a página ----------------
  function atualizarBotoes() {
    const ehCriador = estado.papel === 'criador' && !!estado.live;
    const transmitindo = !!criador.stream;
    botaoCamera.hidden = !ehCriador || transmitindo;
    botaoTela.hidden = !ehCriador || transmitindo;
    botaoParar.hidden = !ehCriador || !transmitindo;
    const comp = criador.composicao;
    painelWebcam.hidden = !ehCriador || !comp;
    opcoesWebcam.hidden = !comp?.temWebcam();
    botaoWebcam.textContent = comp?.temWebcam() ? 'Remover webcam' : 'Adicionar webcam';
  }

  /** Chamado a cada atualização da página com a live no ar (ou null). */
  function sincronizar(live) {
    if (criador.stream && criador.live !== live?.live) desligar(false); // live encerrada ou trocada
    const id = live?.live ?? null;
    if (espectador.live !== id) {
      espectador.tentativa++;
      fecharEspectador();
      espectador.live = id;
      clearInterval(espectador.tempo);
      espectador.tempo = id ? setInterval(verificar, INTERVALO_ESPECTADOR_MS) : null;
      if (id) { mostrarAviso(estado.papel === 'criador' ? 'Ligue a câmera para transmitir.' : 'Aguardando o criador ligar a câmera…'); verificar(); }
      else mostrarAviso('');
    }
    if (live && !criador.stream && !espectador.pc && estado.papel === 'criador') mostrarAviso('Ligue a câmera para transmitir.');
    atualizarBotoes();
  }

  botaoCamera.addEventListener('click', () => ligar('camera'));
  botaoTela.addEventListener('click', () => ligar('tela'));
  botaoParar.addEventListener('click', () => desligar());
  botaoSom.addEventListener('click', () => {
    tela.muted = !tela.muted;
    botaoSom.textContent = tela.muted ? 'Ativar som' : 'Silenciar';
  });

  return { sincronizar, parar: () => desligar(), transmitindo: () => !!criador.stream };
}
