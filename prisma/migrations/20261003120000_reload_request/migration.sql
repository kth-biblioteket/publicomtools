-- "Hämta nya inställningar nu" från admin.
ALTER TABLE "Computer" ADD COLUMN "reloadRequestedAt" TIMESTAMP(3),
ADD COLUMN "reloadRequestedBy" TEXT;
