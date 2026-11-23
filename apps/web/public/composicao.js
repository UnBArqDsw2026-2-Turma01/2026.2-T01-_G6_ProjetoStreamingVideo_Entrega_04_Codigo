// Compõe a transmissão de tela com a webcam por cima, num <canvas> 1280×720, e entrega o resultado como
// MediaStream (é ele que vai para os espectadores e para a gravação). Como o fluxo de saída é sempre o
// mesmo, ligar, desligar ou mover a webcam durante a live não precisa renegociar nenhuma conexão.
export const LARGURA = 1280;
export const ALTURA = 720;
const FPS = 30;
const MARGEM = 0.02;

export const TAMANHOS = { pequena: 0.16, media: 0.22, grande: 0.32 };
// Posição inicial/atalhos: [x, y] do canto, como fração do espaço livre (0 = encostado no início, 1 = no fim).
const CANTOS = { 'sup-esq': [0, 0], 'sup-dir': [1, 0], 'inf-esq': [0, 1], 'inf-dir': [1, 1] };

function criarVideoOculto(stream) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.srcObject = stream;
  v.play().catch(() => {});
  return v;
}

/** Relógio que não é freado quando a aba vai para o segundo plano (o criador troca para a janela compartilhada). */
function criarRelogio(aoTic) {
  try {
    const fonte = `setInterval(() => postMessage(0), ${Math.round(1000 / FPS)})`;
    const url = URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = aoTic;
    return () => { worker.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = setInterval(aoTic, Math.round(1000 / FPS));
    return () => clearInterval(id);
  }
}

export function criarComposicao() {
  const canvas = Object.assign(document.createElement('canvas'), { width: LARGURA, height: ALTURA });
  const ctx = canvas.getContext('2d');
  const audio = new AudioContext();
  const destino = audio.createMediaStreamDestination();
  const fontesAudio = new Map();

  let telaVideo = null;
  let webcamVideo = null;
  let telaStream = null;
  let webcamStream = null;
  // x/y: canto superior esquerdo da webcam como fração do canvas; largura: fração da largura do canvas.
  const webcam = { x: 1 - TAMANHOS.media - MARGEM, y: 1 - MARGEM - 0.2, largura: TAMANHOS.media };

  const proporcaoWebcam = () => (webcamVideo?.videoWidth && webcamVideo?.videoHeight ? webcamVideo.videoHeight / webcamVideo.videoWidth : 9 / 16);

  /** Retângulo da webcam em pixels do canvas (sempre dentro do quadro). */
  function retanguloWebcam() {
    const w = webcam.largura * LARGURA;
    const h = w * proporcaoWebcam();
    const x = Math.min(Math.max(webcam.x * LARGURA, 0), LARGURA - w);
    const y = Math.min(Math.max(webcam.y * ALTURA, 0), ALTURA - h);
    return { x, y, w, h };
  }

  function retangulo(ctx2, x, y, w, h, r) {
    ctx2.beginPath();
    ctx2.moveTo(x + r, y);
    ctx2.arcTo(x + w, y, x + w, y + h, r);
    ctx2.arcTo(x + w, y + h, x, y + h, r);
    ctx2.arcTo(x, y + h, x, y, r);
    ctx2.arcTo(x, y, x + w, y, r);
    ctx2.closePath();
  }

  function desenhar() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    if (telaVideo?.videoWidth) {
      const escala = Math.min(LARGURA / telaVideo.videoWidth, ALTURA / telaVideo.videoHeight);
      const w = telaVideo.videoWidth * escala;
      const h = telaVideo.videoHeight * escala;
      ctx.drawImage(telaVideo, (LARGURA - w) / 2, (ALTURA - h) / 2, w, h);
    }
    if (webcamVideo?.videoWidth) {
      const { x, y, w, h } = retanguloWebcam();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 18;
      retangulo(ctx, x, y, w, h, 14);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
      ctx.save();
      retangulo(ctx, x, y, w, h, 14);
      ctx.clip();
      ctx.drawImage(webcamVideo, x, y, w, h);
      ctx.restore();
      retangulo(ctx, x, y, w, h, 14);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.stroke();
    }
  }

  function ligarAudio(chave, stream) {
    desligarAudio(chave);
    if (!stream?.getAudioTracks().length) return;
    const fonte = audio.createMediaStreamSource(stream);
    fonte.connect(destino);
    fontesAudio.set(chave, fonte);
  }
  function desligarAudio(chave) {
    fontesAudio.get(chave)?.disconnect();
    fontesAudio.delete(chave);
  }

  desenhar();
  const pararRelogio = criarRelogio(desenhar);
  const faixaVideo = canvas.captureStream(FPS).getVideoTracks()[0];
  const stream = new MediaStream([faixaVideo, ...destino.stream.getAudioTracks()]);

  return {
    /** Fluxo final: o vídeo do canvas + o áudio misturado (tela e microfone da webcam). */
    stream,
    temWebcam: () => !!webcamStream,
    definirTela(novo) {
      telaStream?.getTracks().forEach((f) => f.stop());
      telaStream = novo;
      telaVideo = novo ? criarVideoOculto(novo) : null;
      ligarAudio('tela', novo);
    },
    definirWebcam(novo) {
      webcamStream?.getTracks().forEach((f) => f.stop());
      webcamStream = novo;
      webcamVideo = novo ? criarVideoOculto(new MediaStream(novo.getVideoTracks())) : null;
      ligarAudio('webcam', novo);
    },
    /** Move a webcam: `ponto` é o centro desejado, em fração do quadro (0 a 1). */
    centralizarEm(px, py) {
      const { w, h } = retanguloWebcam();
      webcam.x = px - w / LARGURA / 2;
      webcam.y = py - h / ALTURA / 2;
      const r = retanguloWebcam();
      webcam.x = r.x / LARGURA;
      webcam.y = r.y / ALTURA;
    },
    irParaCanto(nome) {
      const [fx, fy] = CANTOS[nome] ?? CANTOS['inf-dir'];
      const { w, h } = retanguloWebcam();
      const folgaX = 1 - w / LARGURA - 2 * MARGEM;
      const folgaY = 1 - h / ALTURA - 2 * MARGEM;
      webcam.x = MARGEM + fx * folgaX;
      webcam.y = MARGEM + fy * folgaY;
    },
    definirTamanho(nome) {
      const antes = retanguloWebcam();
      const cx = (antes.x + antes.w / 2) / LARGURA;
      const cy = (antes.y + antes.h / 2) / ALTURA;
      webcam.largura = TAMANHOS[nome] ?? TAMANHOS.media;
      this.centralizarEm(cx, cy);
    },
    /** O ponto (fração do quadro) cai em cima da webcam? Serve para iniciar o arrasto. */
    sobreWebcam(px, py) {
      if (!webcamVideo?.videoWidth) return false;
      const { x, y, w, h } = retanguloWebcam();
      return px * LARGURA >= x && px * LARGURA <= x + w && py * ALTURA >= y && py * ALTURA <= y + h;
    },
    encerrar() {
      pararRelogio();
      this.definirTela(null);
      this.definirWebcam(null);
      stream.getTracks().forEach((f) => f.stop());
      audio.close().catch(() => {});
    },
  };
}
