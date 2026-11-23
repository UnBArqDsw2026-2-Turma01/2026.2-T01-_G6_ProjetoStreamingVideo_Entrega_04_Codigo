// Câmera da live (WebRTC). Sem dependências nem build; a sinalização está em src/video.ts.
//   criador:   liga a câmera (ou compartilha a tela), mostra a prévia e responde às ofertas dos espectadores;
//   espectador: pergunta se a câmera está ligada, pede o vídeo ao criador e exibe o que chegar.
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

  const criador = { stream: null, live: null, tempo: null, conexoes: new Map(), ocupado: false };
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
    if (tipo === 'tela') return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
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

  async function ligar(tipo) {
    if (!estado.live) return avisar('Abra a live antes de ligar a câmera.');
    if (criador.stream) await desligar();
    let stream;
    try {
      stream = await capturar(tipo);
    } catch (erro) {
      return avisar(mensagemDeErro(erro));
    }
    try {
      await api('POST', `/api/lives/${estado.live.live}/video/camera`, { ativa: true });
    } catch (erro) {
      stream.getTracks().forEach((f) => f.stop());
      return avisar(erro.message);
    }
    Object.assign(criador, { stream, live: estado.live.live });
    // Se o navegador (ou o usuário, no compartilhamento de tela) encerrar a captura, desliga tudo.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => desligar());
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
    criador.stream?.getTracks().forEach((f) => f.stop());
    criador.conexoes.forEach((pc) => pc.close());
    criador.conexoes.clear();
    const live = criador.live;
    Object.assign(criador, { stream: null, live: null });
    mostrarVideo(null);
    if (avisarServidor && live) await api('POST', `/api/lives/${live}/video/camera`, { ativa: false }).catch(() => {});
    atualizarBotoes();
    sincronizar(estado.live);
  }

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
