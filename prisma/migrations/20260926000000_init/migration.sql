-- CreateTable
CREATE TABLE "Computer" (
    "host" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "profile" TEXT,
    "computerType" TEXT,
    "computerName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastIp" TEXT,
    "status" JSONB NOT NULL,

    CONSTRAINT "Computer_pkey" PRIMARY KEY ("host")
);

-- CreateTable
CREATE TABLE "Heartbeat" (
    "id" BIGSERIAL NOT NULL,
    "host" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" JSONB NOT NULL,

    CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Heartbeat_host_receivedAt_idx" ON "Heartbeat"("host", "receivedAt");

-- AddForeignKey
ALTER TABLE "Heartbeat" ADD CONSTRAINT "Heartbeat_host_fkey" FOREIGN KEY ("host") REFERENCES "Computer"("host") ON DELETE CASCADE ON UPDATE CASCADE;

