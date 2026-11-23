// `npm run dev`: a mesma aplicação em duas portas, para testar criador e espectador ao mesmo tempo.
// Abra a primeira porta e entre como criador; abra a segunda e entre como espectador. Cada porta
// guarda o próprio login, e as duas compartilham lives, chat, vídeo e gravações.
import { createServer } from 'node:net';
import { subir } from './servidor';

const livre = (porta: number) =>
  new Promise<boolean>((resolver) => {
    const teste = createServer()
      .once('error', () => resolver(false))
      .once('listening', () => teste.close(() => resolver(true)));
    teste.listen(porta);
  });

/** Primeiro par de portas vizinhas livres a partir de `base` (3000/3001; se ocupadas, 3002/3003...). */
async function acharPar(base: number): Promise<[number, number]> {
  for (let porta = base; porta < base + 20; porta += 2) {
    if ((await livre(porta)) && (await livre(porta + 1))) return [porta, porta + 1];
  }
  throw new Error(`Nenhum par de portas livres a partir de ${base}. Use PORT=<outra base> npm run dev`);
}

const base = Number(process.env.PORT ?? 3000);
const [criador, espectador] = await acharPar(base);
if (criador !== base) console.log(`Portas ${base}/${base + 1} ocupadas (algum npm run web/dev aberto?); usando ${criador}/${espectador}.`);
void subir([criador, espectador]);
console.log(`\nTeste com duas contas:\n  criador    → http://localhost:${criador}\n  espectador → http://localhost:${espectador}\n  (código do criador: npm run totp)\n`);
