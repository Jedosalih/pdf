# Build context is the repo root (see docker-compose.yml) so this image can
# copy the shared prisma/schema.prisma — the worker is otherwise an
# independently deployable unit (blueprint §5, §70).
FROM node:22-bookworm-slim

WORKDIR /app

# A fixed, non-user-specific install location — by default Playwright
# installs into whichever user's home directory ran `install`, which
# breaks once the container switches to a different non-root runtime user
# below (verified empirically: the default path resolved to `/root/...`
# at build time but the runtime user looks in `/home/jpdf/...`, so the
# browser "doesn't exist" at container start).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY workers/html/package.json ./
# Do NOT use --omit=optional here: TypeScript 7's compiler ships as a
# platform-specific native binary via an optional dependency — see
# docs/DECISIONS.md.
RUN npm install

# Installs Chromium plus its full OS-level dependency set (fonts, shared
# libs) via Playwright's own installer, rather than hand-tracking the
# growing list of libraries Chromium needs on Debian.
RUN npx playwright install --with-deps chromium \
    && chmod -R o+rx /ms-playwright

COPY prisma ./prisma
COPY workers/html/tsconfig.json ./
COPY workers/html/src ./src

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

# Chromium's own internal sandbox (kept enabled — see docs/DECISIONS.md
# for why blanket --no-sandbox / --cap-add=SYS_ADMIN are not acceptable
# alternatives for a worker rendering hostile HTML input) will not fully
# engage when running as root, so this container runs as a dedicated
# non-root user.
RUN groupadd -r jpdf && useradd -r -g jpdf -G audio,video jpdf \
    && mkdir -p /home/jpdf \
    && chown -R jpdf:jpdf /home/jpdf /app
USER jpdf

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
