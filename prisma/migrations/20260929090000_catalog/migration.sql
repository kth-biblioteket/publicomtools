-- Nyckelkatalogen blir en cache av config/catalog.json i publicom.

-- AlterTable
ALTER TABLE "Computer" ADD COLUMN "configFetchedAt" TIMESTAMP(3);

-- AlterTable: befintliga rader (från seed-config) får nyckeln som etikett tills katalogen synkas.
ALTER TABLE "ConfigKey" ADD COLUMN "label" TEXT,
ADD COLUMN "group" TEXT,
ADD COLUMN "options" JSONB,
ADD COLUMN "unit" TEXT,
ADD COLUMN "defaultValue" TEXT,
ADD COLUMN "advanced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "ConfigKey" SET "label" = "key", "group" = 'ovrigt';
UPDATE "ConfigKey" SET "options" = (
  SELECT jsonb_agg(jsonb_build_object('value', v, 'label', v))
  FROM unnest(string_to_array("enumValues", ',')) AS v
) WHERE "enumValues" IS NOT NULL AND "enumValues" <> '';

ALTER TABLE "ConfigKey" ALTER COLUMN "label" SET NOT NULL,
ALTER COLUMN "group" SET NOT NULL,
DROP COLUMN "enumValues";

-- CreateTable
CREATE TABLE "ConfigCatalog" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "groups" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "fetchedBy" TEXT NOT NULL,

    CONSTRAINT "ConfigCatalog_pkey" PRIMARY KEY ("id")
);
