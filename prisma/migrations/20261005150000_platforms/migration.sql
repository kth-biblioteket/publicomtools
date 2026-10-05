-- Android-enheter (PubLiKiosk) bredvid Linux-datorerna: plattform på datorer, lager och katalog,
-- och en egen token per enhet (inskrivning med engångskod).

ALTER TABLE "Computer"
    ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'linux',
    ADD COLUMN "tokenHash" TEXT,
    ADD COLUMN "enrollCodeHash" TEXT,
    ADD COLUMN "enrollExpiresAt" TIMESTAMP(3),
    ADD COLUMN "enrolledAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Computer_tokenHash_key" ON "Computer"("tokenHash");
CREATE UNIQUE INDEX "Computer_enrollCodeHash_key" ON "Computer"("enrollCodeHash");

ALTER TABLE "ConfigLayer" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'linux';

ALTER TABLE "ConfigKey" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'linux';
ALTER TABLE "ConfigKey" DROP CONSTRAINT "ConfigKey_pkey";
ALTER TABLE "ConfigKey" ADD CONSTRAINT "ConfigKey_pkey" PRIMARY KEY ("platform", "key");

ALTER TABLE "ConfigCatalog" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'linux';
ALTER TABLE "ConfigCatalog" DROP CONSTRAINT "ConfigCatalog_pkey";
ALTER TABLE "ConfigCatalog" DROP COLUMN "id";
ALTER TABLE "ConfigCatalog" ADD CONSTRAINT "ConfigCatalog_pkey" PRIMARY KEY ("platform");
