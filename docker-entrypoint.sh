#!/bin/sh
set -e

# Applies any migrations not yet applied to this database (a no-op once up to date).
# The prisma CLI lives in /migrator (its own dependency tree); run it against the
# app's schema. DATABASE_URL comes from the environment (docker-compose.yml).
node /migrator/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

# Next.js standalone server (see output: "standalone" in next.config.ts).
# Docker sets HOSTNAME to the container id, which would make the server bind to
# that name instead of all interfaces — force 0.0.0.0 here so Traefik can reach it.
export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"
exec node /app/server.js
