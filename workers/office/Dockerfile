# Build context is the repo root (see docker-compose.yml) so this image can
# copy the shared prisma/schema.prisma — the worker is otherwise an
# independently deployable unit (blueprint §5, §70).
FROM node:22-bookworm-slim

# Targeted LibreOffice components (not the full metapackage) + fonts for
# all three product locales (en/ar/tr).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-core \
       poppler-utils \
       fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY workers/office/package.json ./
# Do NOT use --omit=optional here: TypeScript 7's compiler ships as a
# platform-specific native binary via an optional dependency — see
# docs/DECISIONS.md.
RUN npm install

COPY prisma ./prisma
COPY workers/office/tsconfig.json ./
COPY workers/office/src ./src

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

# Runs as a dedicated non-root user, not the container default root —
# LibreOffice parses hostile user-uploaded documents directly, so a parser
# exploit should not hand an attacker root inside the container. Same
# pattern as workers/html's Dockerfile.
RUN groupadd -r jpdf && useradd -r -g jpdf jpdf \
    && mkdir -p /home/jpdf \
    && chown -R jpdf:jpdf /home/jpdf /app
USER jpdf

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
