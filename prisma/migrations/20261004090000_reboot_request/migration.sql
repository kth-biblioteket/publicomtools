-- "Starta om datorn" från admin.
ALTER TABLE "Computer" ADD COLUMN "rebootRequestedAt" TIMESTAMP(3),
ADD COLUMN "rebootRequestedBy" TEXT;
