-- Sida som bild (skyltar som inte klarar levande sidor)
CREATE TABLE "Snap" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "refreshMin" INTEGER NOT NULL,
    "renderedAt" TIMESTAMP(3),
    "renderMs" INTEGER,
    "bytes" INTEGER,
    "error" TEXT,
    "errorAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Snap_url_width_height_key" ON "Snap"("url", "width", "height");
