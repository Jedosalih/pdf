# Next.js app image for docker-compose.prod.yml (the workers have their
# own Dockerfiles under workers/*). Build context is the repo root;
# .dockerignore keeps .env files, node_modules and local state out of it.
FROM node:22-bookworm-slim AS base
# Prisma's schema engine (migrations, in the `migrate` service) needs
# OpenSSL, which the slim image lacks -- same as every worker image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# prisma.config.ts requires DATABASE_URL even though `generate` never
# connects; a placeholder scoped to this one command.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# Inlined into client bundles at build time, so it must be the real
# public origin of this deployment.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN npm run build

FROM base
WORKDIR /app
ENV NODE_ENV=production
# The full tree (including dev dependencies) is kept deliberately: the
# one-shot `migrate` service in docker-compose.prod.yml runs the Prisma
# CLI and the tsx-based seed from this same image.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
