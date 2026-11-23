// `npm run dev`: a mesma aplicação em duas portas, para testar criador e espectador ao mesmo tempo.
// Abra a primeira porta e entre como criador; abra a segunda e entre como espectador. Cada porta
// guarda o próprio login, e as duas compartilham lives, chat, vídeo e gravações.
import { subir } from './servidor';

const base = Number(process.env.PORT ?? 3000);
subir([base, base + 1]);
console.log(`\nTeste com duas contas:\n  criador    → http://localhost:${base}\n  espectador → http://localhost:${base + 1}\n  (código do criador: npm run totp)\n`);
