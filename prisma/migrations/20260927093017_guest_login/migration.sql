-- CreateTable
CREATE TABLE "GuestLogin" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "computerName" TEXT,
    "defaultHours" INTEGER NOT NULL,
    "loginType" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "bookingId" TEXT,
    "userLabel" TEXT,
    "startTime" INTEGER,
    "endTime" INTEGER,

    CONSTRAINT "GuestLogin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestLogin_host_status_idx" ON "GuestLogin"("host", "status");

-- CreateIndex
CREATE INDEX "GuestLogin_createdAt_idx" ON "GuestLogin"("createdAt");
