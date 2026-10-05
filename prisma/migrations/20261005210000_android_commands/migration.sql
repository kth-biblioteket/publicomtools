-- Android: skärmdump, upplåsning av PIN-menyn och återställningskod.
ALTER TABLE "Computer"
    ADD COLUMN "recoveryCode" TEXT,
    ADD COLUMN "screenshotRequestedAt" TIMESTAMP(3),
    ADD COLUMN "screenshotRequestedBy" TEXT,
    ADD COLUMN "pinUnlockRequestedAt" TIMESTAMP(3),
    ADD COLUMN "pinUnlockRequestedBy" TEXT;

CREATE TABLE "DeviceScreenshot" (
    "host" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeviceScreenshot_pkey" PRIMARY KEY ("host")
);
ALTER TABLE "DeviceScreenshot" ADD CONSTRAINT "DeviceScreenshot_host_fkey" FOREIGN KEY ("host") REFERENCES "Computer"("host") ON DELETE CASCADE ON UPDATE CASCADE;
