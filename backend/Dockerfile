# syntax=docker/dockerfile:1.7
# Token Tails backend image (infra/gcp/RUNBOOK.md). One image, three process roles picked at run time with
# BACKEND_ROLE (all | api | relay, src/shared/runtime/backend-role.ts):
#   Cloud Run tt-api:   BACKEND_ROLE=api   NODE_ENV=production PORT=8080 (Cloud Run sets PORT)
#   relay VM tt-relay:  BACKEND_ROLE=relay NODE_ENV=production PORT=8080 (docker run --init --network host)
#   Cloud Run job tt-migrate: command override `npx migrate-mongo up`
# Node 22 matches CI (ci.yml NODE_VERSION) and the DigitalOcean node buildpack. No secret is baked in: every value
# comes from the runtime environment (Secret Manager on Google Cloud).
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=1 NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The same build DigitalOcean runs (`npx @nestjs/cli build`), test/ and specs excluded by tsconfig.build.json.
RUN npx @nestjs/cli build && test -f dist/main.js

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
ENV CI=1 NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
# postinstall reinstalls sharp for this platform (linux-x64 glibc); devDependencies are left out.
RUN npm ci --omit=dev && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
# tini forwards SIGTERM to node, so the relay hands its rooms off (MULTIPLAYER.md §3.6) and Nest runs its
# shutdown hooks; `docker run --init` on the VM does the same and is harmless on top.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json migrate-mongo-config.js ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main"]
