#!/bin/sh
set -e

# Applies any migrations that haven't been applied to this database yet.
# Safe to run on every container start/restart — it's a no-op once the
# database is already up to date. Never generates new migrations or asks
# for confirmation (that's `prisma migrate dev`, a dev-only command).
npx prisma migrate deploy

exec npx next start -p "${PORT:-3000}"
