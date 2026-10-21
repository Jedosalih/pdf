# Build context is the repo root (see docker-compose.yml) so this image can
# copy the shared prisma/schema.prisma — the worker is otherwise an
# independently deployable unit (blueprint §5, §70).
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends qpdf ghostscript poppler-utils openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY workers/pdf/package.json workers/pdf/package-lock.json ./
# Do NOT use --omit=optional here: TypeScript 7's compiler ships as a
# platform-specific native binary via an optional dependency
# (e.g. @typescript/typescript-linux-x64) — omitting optional deps breaks
# `tsc` inside the image. See docs/DECISIONS.md.
RUN npm ci

COPY prisma ./prisma
COPY workers/pdf/tsconfig.json ./
COPY workers/pdf/src ./src

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

# Runs as a dedicated non-root user, not the container default root —
# these binaries (qpdf/ghostscript/poppler) run directly against
# user-uploaded, potentially hostile PDFs, so a parser exploit should not
# hand an attacker root inside the container. Same pattern as
# workers/html's Dockerfile.
RUN groupadd -r jpdf && useradd -r -g jpdf jpdf \
    && mkdir -p /home/jpdf \
    && chown -R jpdf:jpdf /home/jpdf /app
USER jpdf

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
