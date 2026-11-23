// Grava o que o criador transmite (MediaRecorder) e envia os pedaços ao servidor enquanto a live está no ar.
// Assim a gravação fica pronta assim que a live acaba, e o que já foi enviado sobrevive se a aba fechar.
const TIPOS = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const PEDACO_MS = 3000;

export function criarGravador({ estado }) {
  let gravador = null;
  let fila = Promise.resolve();

  async function enviar(live, parte, tipo, dados) {
    const resposta = await fetch(`/api/lives/${live}/gravacao/${parte}`, {
      method: 'POST',
      headers: { 'content-type': tipo, ...(estado.token ? { authorization: `Bearer ${estado.token}` } : {}) },
      body: dados,
    });
    if (!resposta.ok) throw new Error(`gravação: ${resposta.status}`);
  }

  async function iniciar(stream, live) {
    await parar();
    const mime = window.MediaRecorder && TIPOS.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) return false; // navegador sem MediaRecorder: a live segue, só não há gravação
    const tipo = mime.split(';')[0];
    try {
      const abertura = await fetch(`/api/lives/${live}/gravacao`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${estado.token}` },
        body: JSON.stringify({ tipo }),
      });
      if (!abertura.ok) return false;
      const { parte } = await abertura.json();
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
      rec.addEventListener('dataavailable', (e) => {
        if (e.data.size) fila = fila.then(() => enviar(live, parte, tipo, e.data)).catch(() => {});
      });
      rec.start(PEDACO_MS);
      gravador = rec;
      return true;
    } catch {
      return false;
    }
  }

  /** Para a gravação e espera o último pedaço chegar ao servidor. */
  async function parar() {
    const rec = gravador;
    gravador = null;
    if (rec && rec.state !== 'inactive') {
      await new Promise((resolver) => {
        rec.addEventListener('stop', resolver, { once: true });
        rec.stop();
      });
    }
    await fila;
  }

  return { iniciar, parar, gravando: () => !!gravador };
}
