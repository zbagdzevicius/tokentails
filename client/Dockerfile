# syntax=docker/dockerfile:1.7
# tokentails.com web image for Cloud Run tt-web (infra/gcp/RUNBOOK.md, phase 2 of the migration).
# Next 16 `output: "standalone"` (next.config.js; the Capacitor app build stays a static export).
#
# NEXT_PUBLIC_* values are inlined at build time. They come from GitHub repository variables, passed by
# deploy-gcp.yml as the BuildKit secret `public_env` (a shell-quoted KEY='value' file). Real environment
# variables win over the committed client/.env.production, exactly as on Vercel. No server secret is baked in.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV CI=1 NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=6144
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` = next build --webpack, then postbuild (next-sitemap, feed RSS into public/).
RUN --mount=type=secret,id=public_env,required=false \
    set -a; if [ -f /run/secrets/public_env ]; then . /run/secrets/public_env; fi; set +a; \
    npm run build && test -f .next/standalone/server.js

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
# The standalone server does not serve public/ or .next/static by itself: copy them next to it. public/ is copied
# after the build so the generated sitemap and RSS are included. Cloudflare caches the static paths (RUNBOOK.md).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# ISR writes its cache here (per instance on Cloud Run).
RUN mkdir -p .next/cache && chown -R node:node .next/cache
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
