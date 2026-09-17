# Build context is the repo root (see docker-compose.yml) so this image can
# copy the shared prisma/schema.prisma — the worker is otherwise an
# independently deployable unit (blueprint §5, §70).
FROM node:22-bookworm-slim

WORKDIR /app

COPY workers/cleanup/package.json ./
# Do NOT use --omit=optional here: TypeScript 7's compiler ships as a
# platform-specific native binary via an optional dependency — see
# docs/DECISIONS.md.
RUN npm install

COPY prisma ./prisma
COPY workers/cleanup/tsconfig.json ./
COPY workers/cleanup/src ./src

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

# No engine binaries here (pure Node, Postgres/Redis/S3 clients only), so
# unlike the other workers there's nothing this container needs root for
# even transiently -- still runs as a dedicated non-root user for defense
# in depth and consistency with every other worker in this repo.
RUN groupadd -r jpdf && useradd -r -g jpdf jpdf \
    && mkdir -p /home/jpdf \
    && chown -R jpdf:jpdf /home/jpdf /app
USER jpdf

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
