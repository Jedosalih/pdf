# Build context is the repo root (see docker-compose.yml) so this image can
# copy the shared prisma/schema.prisma — the worker is otherwise an
# independently deployable unit (blueprint §5, §70).
FROM node:22-bookworm-slim

# ocrmypdf pulls in Ghostscript + qpdf itself as dependencies, but we pin
# them explicitly rather than relying on transitive resolution.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ocrmypdf tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara tesseract-ocr-tur \
       qpdf ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY workers/ocr/package.json ./
# Do NOT use --omit=optional here: TypeScript 7's compiler ships as a
# platform-specific native binary via an optional dependency — see
# docs/DECISIONS.md.
RUN npm install

COPY prisma ./prisma
COPY workers/ocr/tsconfig.json ./
COPY workers/ocr/src ./src

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
