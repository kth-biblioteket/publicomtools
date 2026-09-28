#!/bin/sh
set -e

# Applies any migrations that haven't been applied to this database yet.
# A no-op once the database is up to date. Uses the prisma CLI copied into the
# image (not npx, which would try to download it).
node node_modules/prisma/build/index.js migrate deploy

# Next.js standalone server (see output: "standalone" in next.config.ts).
# Docker sets HOSTNAME to the container id, which would make the server bind to
# that name instead of all interfaces — force 0.0.0.0 here so Traefik can reach it.
export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"
exec node server.js
