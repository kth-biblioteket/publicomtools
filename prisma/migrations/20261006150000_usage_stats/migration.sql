-- Användningsstatistik: besök som enheterna rapporterar, och igångtid per enhet och dag.
CREATE TABLE "Visit" (
    "id" BIGSERIAL NOT NULL,
    "host" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "seconds" INTEGER NOT NULL,
    "reason" TEXT,
    "pages" INTEGER,
    "platform" TEXT NOT NULL,
    "profile" TEXT,
    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Visit_host_startedAt_key" ON "Visit"("host", "startedAt");
CREATE INDEX "Visit_startedAt_idx" ON "Visit"("startedAt");
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_host_fkey" FOREIGN KEY ("host") REFERENCES "Computer"("host") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeviceDay" (
    "host" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "onlineSeconds" INTEGER NOT NULL DEFAULT 0,
    "platform" TEXT NOT NULL,
    "profile" TEXT,
    CONSTRAINT "DeviceDay_pkey" PRIMARY KEY ("host", "day")
);
CREATE INDEX "DeviceDay_day_idx" ON "DeviceDay"("day");
ALTER TABLE "DeviceDay" ADD CONSTRAINT "DeviceDay_host_fkey" FOREIGN KEY ("host") REFERENCES "Computer"("host") ON DELETE CASCADE ON UPDATE CASCADE;
