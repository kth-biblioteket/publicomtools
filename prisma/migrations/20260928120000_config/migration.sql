-- AlterTable
ALTER TABLE "Computer" ADD COLUMN     "overrides" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "configUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "configUpdatedBy" TEXT;

-- CreateTable
CREATE TABLE "ConfigLayer" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigKey" (
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enumValues" TEXT,
    "help" TEXT,
    "example" TEXT,

    CONSTRAINT "ConfigKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ConfigChange" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ConfigChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfigLayer_kind_name_key" ON "ConfigLayer"("kind", "name");

-- CreateIndex
CREATE INDEX "ConfigChange_target_changedAt_idx" ON "ConfigChange"("target", "changedAt");
