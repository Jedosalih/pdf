# Build context is the repo root (see docker-compose.yml) so this image can
# copy the shared prisma/schema.prisma — the worker is otherwise an
# independently deployable unit (blueprint §5, §70).
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends qpdf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY workers/pdf/package.json ./
RUN npm install --omit=optional

COPY prisma ./prisma
COPY workers/pdf/tsconfig.json ./
COPY workers/pdf/src ./src

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
