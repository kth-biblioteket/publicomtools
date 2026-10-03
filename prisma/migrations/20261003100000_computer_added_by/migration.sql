-- Datorer som läggs till i admin innan de installeras.
ALTER TABLE "Computer" ADD COLUMN "addedBy" TEXT;
