-- Vilka tjänster (APPS) som användes under ett besök, och hur länge. Rensas med besöket.
CREATE TABLE "VisitApp" (
    "host" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    CONSTRAINT "VisitApp_pkey" PRIMARY KEY ("host", "startedAt", "url")
);
CREATE INDEX "VisitApp_url_idx" ON "VisitApp"("url");
ALTER TABLE "VisitApp" ADD CONSTRAINT "VisitApp_host_startedAt_fkey" FOREIGN KEY ("host", "startedAt") REFERENCES "Visit"("host", "startedAt") ON DELETE CASCADE ON UPDATE CASCADE;
