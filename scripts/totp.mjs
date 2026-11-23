// Imprime o código TOTP atual da conta de demonstração do criador (criador@ca01.test).
// Uso: npm run totp   (o código vale por 30 s; é o mesmo que o app autenticador mostraria).
import { generateTotp } from '@g6/identidade';

const SEGREDO_PUBLICO_DE_DEMO = Buffer.from('segredo-publico-demo-ca01');
console.log(generateTotp(SEGREDO_PUBLICO_DE_DEMO, new Date()));
