# Production image for publicomtools, used by docker-compose.yml. Not used
# for local dev — see Dockerfile-dev and docker-compose-dev.yml for that.
#
# The Node version is pinned to an exact patch and matches .nvmrc,
# package.json's "engines" and Dockerfile-dev. Bump all of them together.

# ---- deps: install once, reused by the builder stage ----
FROM node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate the Prisma client and build the Next.js app ----
FROM node:22.23.2-alpine AS builder
WORKDIR /app
# Baked into the build — see next.config.ts. Must match the Traefik
# PathPrefix this image is deployed behind (PATHPREFIX in docker-compose.yml).
ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH}
# Only needed so prisma.config.ts's env("DATABASE_URL") validation passes —
# `prisma generate` and `next build` never connect to a database. The real
# DATABASE_URL is supplied at container runtime (docker-compose.yml).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: the smallest image that can actually run the app ----
FROM node:22.23.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next's standalone server listens on this host/port. HOSTNAME must be 0.0.0.0
# so Traefik on apps-net can reach it (default would bind localhost only).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Next standalone: server.js + a traced, minimal node_modules (incl. @prisma/client
# and the query engine via the generated client in src/), package.json and .next.
# This is what shrinks the image from ~2 GB to a few hundred MB.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# `prisma migrate deploy` at startup needs the CLI, engines, config and dotenv.
# These are only used at container start, so standalone doesn't trace them —
# copy them in on top of the standalone node_modules.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
