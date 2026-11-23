# Login web — issue #17

Rotas instaladas por `registrarRotas`, chamadas pelo servidor existente:

| Rota | Entrada | Resposta |
| --- | --- | --- |
| `POST /api/login` | `email`, `senha`, `codigoTotp` opcional | token, papel, usuário e validade |
| `GET /api/sessao` | `Authorization: Bearer <token>` | sessão reconhecida pelo contexto HTTP |
| `POST /api/step-up` | mesmo cabeçalho e `{ "codigo": "123456" }` | sessão após confirmação de TOTP |

O registro padrão monta `criarAutenticacaoExemplo()` de `@g6/identidade` uma vez
por aplicação. O estado do TOTP e das sessões é compartilhado entre suas rotas,
sem usar `FakeAutenticacao` para o login. `criarRegistroAutenticacao(port)` permite
injeção para testes ou outra montagem das contas.

## Uso

Execute `npm run web` e clique em **Entrar como criador** ou **Entrar como espectador**.
A página `/login.html` recebe o papel e sugere o e-mail de exemplo. Os dados públicos
ficam em **Contas de demonstração**: senha `Exemplo-CA01!`, e-mails
`criador@ca01.test` e `espectador@ca01.test`. Para o criador, cadastre o segredo Base32
exibido no autenticador (TOTP SHA-1, 6 dígitos, 30 segundos).

Após o login, a página volta à transmissão e usa o token nas chamadas existentes.
A sessão fica em `localStorage`, uma por papel, e sobrevive a recarga, nova aba e reinício
do navegador até expirar (4 h) ou até o servidor reiniciar. Cada aba lembra o papel ativo em
`sessionStorage`, então criador e espectador podem ficar abertos lado a lado; clicar em
**Entrar como** um papel que já tem sessão válida não pede senha nem TOTP de novo. Senha e TOTP
não são armazenados.
O servidor valida a sessão no retorno. A confirmação de identidade fica no link
**Confirmar identidade**, usa o mesmo token e exige um código ainda não utilizado.
**Sair** remove do navegador a sessão do papel ativo; não revoga o token no servidor, que continua
válido até expirar. O contrato atual não oferece logout/revogação pelo port.

## Integração dentro do escopo

A issue permite apenas `src/auth/**` e `public/login.*`. Por isso, o ponto de extensão
serve `/app.js` lendo o módulo original e anexando `login.js` na mesma resposta.
A ponte intercepta os botões de entrada e restaura `estado` no mesmo escopo do módulo
original, sem editar `public/app.js`, `index.html` ou o servidor da issue #16.
`login.js` também roda sozinho na tela de login, com guarda pelo formulário presente.
Se a página da #16 mudar os nomes `estado`, `atualizar`, `avisar` ou `.sessao`, essa
ponte precisa ser ajustada. Esse acoplamento está concentrado no bloco final do script.

A rota provisória `/api/demo/sessao` da #16 continua disponível diretamente, embora
os botões passem a usar login real. Sua retirada exige mudança em `src/rotas.ts`,
fora do escopo desta issue; esta aplicação continua sendo uma demonstração local,
não uma implantação com controle de acesso de produção. A composição dos demais
ports do CA-01 permanece a existente.

## Testes

```bash
npm run typecheck
node --import tsx --test apps/web/src/auth/login.test.ts
npm test
npm run verificar --prefix scripts/arquitetura
```

Os testes HTTP desta issue ficam em `src/auth` para respeitar o escopo e devem ser
executados pelo comando explícito acima: o script atual de `@g6/web` só procura
`test/**/*.test.ts`. Cobrem os dois papéis contra o serviço real, sessão em `/api/saldo`
e abertura de live, desafio de TOTP, step-up, replay, entradas inválidas e token falso.
Revisão prevista pela issue: Mateus Rodrigues Barreto.
