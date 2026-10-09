# Production image for publicomtools, used by docker-compose.yml. Not used
# for local dev — see Dockerfile-dev and docker-compose-dev.yml for that.
#
# The Node version is pinned to an exact patch and matches .nvmrc,
# package.json's "engines" and Dockerfile-dev. Bump all of them together.
#
# The official Node image is pulled from AWS's mirror of Docker Hub's library
# (public.ecr.aws/docker/library), not docker.io: GitHub's runners hit Docker
# Hub's anonymous pull limit (429) and its outages. Same image, same tag.
# Same layout as bookingtools.

# ---- deps: install once, reused by the builder stage ----
FROM public.ecr.aws/docker/library/node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- prod-deps: runtime dependencies only (no typescript/eslint/tailwind) for
# the runner stage. `prisma` and `dotenv` are regular dependencies, since
# `prisma migrate deploy` (which loads prisma.config.ts) runs at container start.
FROM public.ecr.aws/docker/library/node:22.23.2-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- builder: generate the Prisma client and build the Next.js app ----
FROM public.ecr.aws/docker/library/node:22.23.2-alpine AS builder
WORKDIR /app
# Baked into the build (see next.config.ts). Must match the Traefik PathPrefix
# this image is deployed behind (PATHPREFIX in docker-compose.yml).
ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH}
# Only so prisma.config.ts's env("DATABASE_URL") validation passes — `prisma
# generate` and `next build` never connect to a database. The real DATABASE_URL
# is supplied at container runtime (docker-compose.yml).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: the smallest image that can actually run the app ----
FROM public.ecr.aws/docker/library/node:22.23.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# --chown on every COPY, not a trailing `chown -R /app`: a separate RUN that
# touches every file rewrites them all into a new layer, doubling the image.
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
# Prisma schema/migrations (for `prisma migrate deploy` at startup) and the
# generated client's native query-engine binary — the latter lives outside
# node_modules because schema.prisma outputs the client to src/generated/prisma.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

COPY --chown=nextjs:nodejs --chmod=755 docker-entrypoint.sh ./

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
