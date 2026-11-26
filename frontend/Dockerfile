# syntax=docker/dockerfile:1.7
# Multi-arch: node:22-alpine ships arm64 and amd64, so this builds natively on an
# Oracle Ampere (ARM) instance. Build on the server, or cross-build with
#   docker buildx build --platform linux/arm64 -t bazaar-web ./frontend

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The optional "ca" secret is only for building behind a TLS-inspecting proxy.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build args.
# Never pass the Supabase service-role key here; the build refuses it anyway.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STORE_NAME="The Bazaar"
ARG NEXT_PUBLIC_CURRENCY=USD
ARG NEXT_PUBLIC_DEMO_DATA=off
ARG NEXT_PUBLIC_MAP_STYLE
ARG NEXT_PUBLIC_MAP_STYLE_DARK
ARG NEXT_PUBLIC_MAP_TILES
ARG NEXT_PUBLIC_MAP_ATTRIBUTION
ARG NEXT_PUBLIC_MAP_CENTER
ARG NEXT_PUBLIC_IMAGE_HOST
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_STORE_NAME="$NEXT_PUBLIC_STORE_NAME" \
    NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY \
    NEXT_PUBLIC_DEMO_DATA=$NEXT_PUBLIC_DEMO_DATA \
    NEXT_PUBLIC_MAP_STYLE=$NEXT_PUBLIC_MAP_STYLE \
    NEXT_PUBLIC_MAP_STYLE_DARK=$NEXT_PUBLIC_MAP_STYLE_DARK \
    NEXT_PUBLIC_MAP_TILES=$NEXT_PUBLIC_MAP_TILES \
    NEXT_PUBLIC_MAP_ATTRIBUTION=$NEXT_PUBLIC_MAP_ATTRIBUTION \
    NEXT_PUBLIC_MAP_CENTER=$NEXT_PUBLIC_MAP_CENTER \
    NEXT_PUBLIC_IMAGE_HOST=$NEXT_PUBLIC_IMAGE_HOST
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 10001 web && adduser -S -u 10001 -G web web
COPY --from=build --chown=web:web /app/.next/standalone ./
COPY --from=build --chown=web:web /app/.next/static ./.next/static
COPY --from=build --chown=web:web /app/public ./public
USER web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/robots.txt >/dev/null || exit 1
# Run with an init process (compose: init: true) so signals reach Node cleanly.
CMD ["node", "server.js"]
