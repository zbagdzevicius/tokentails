# syntax=docker/dockerfile:1.7
# cats.tokentails.com admin CMS image for Cloud Run tt-cms (infra/gcp/RUNBOOK.md). Next 16 `output: 'standalone'`.
# NEXT_PUBLIC_* values (NEXT_PUBLIC_BE_URL and the Firebase web config) are inlined at build time from the BuildKit
# secret `public_env` (GitHub repository variables, see deploy-gcp.yml); they override the committed .env.production.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV CI=1 NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=1 NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=public_env,required=false \
    set -a; if [ -f /run/secrets/public_env ]; then . /run/secrets/public_env; fi; set +a; \
    npm run build && test -f .next/standalone/server.js

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p .next/cache && chown -R node:node .next/cache
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
