# Ambiente local do monorepo G6 (Node 22 + npm workspaces).
FROM node:22-bookworm-slim

WORKDIR /app

# Manifests primeiro para aproveitar cache de camadas no npm ci.
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

COPY . .

# node:22 já cria o usuário "node" (uid 1000).
RUN chown -R node:node /app
USER node

ENV NODE_ENV=development
ENV PORT=3000

EXPOSE 3000

# Keep-alive para o serviço `dev` do Compose; profiles sobrescrevem o comando.
CMD ["sleep", "infinity"]
