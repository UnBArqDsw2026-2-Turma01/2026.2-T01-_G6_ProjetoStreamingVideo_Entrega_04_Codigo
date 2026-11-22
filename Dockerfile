# Imagem do monorepo G6 para demonstração do CA-01 (#20).
# O engines do repositório exige Node >=22 (a issue citava 20; alinhamos ao monorepo).
FROM node:22-bookworm-slim

WORKDIR /app

# Manifests primeiro: cacheia `npm ci` quando só o código muda.
COPY package.json package-lock.json ./
COPY apps/cli-demo/package.json ./apps/cli-demo/
COPY apps/web/package.json ./apps/web/
COPY packages/chat/package.json ./packages/chat/
COPY packages/conteudo/package.json ./packages/conteudo/
COPY packages/identidade/package.json ./packages/identidade/
COPY packages/moderacao/package.json ./packages/moderacao/
COPY packages/monetizacao/package.json ./packages/monetizacao/
COPY packages/shared-kernel/package.json ./packages/shared-kernel/
COPY packages/transmissao/package.json ./packages/transmissao/

RUN npm ci

# Código do monorepo (sem .env: gateway de pagamento fica só o simulado).
COPY . .

RUN chown -R node:node /app
USER node

# Sem credenciais de Mercado Pago/Stripe na imagem: gatewaysDoAmbiente usa só `simulado`.
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Serve a página integrada do CA-01 (`apps/web`).
CMD ["npm", "run", "web"]
