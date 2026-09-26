#!/bin/sh
set -e

# Applies any migrations that haven't been applied to this database yet.
# A no-op once the database is up to date.
npx prisma migrate deploy

exec npx next start -p "${PORT:-3000}"
