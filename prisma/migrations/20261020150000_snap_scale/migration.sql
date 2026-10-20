-- Sida som bild i dubbel upplösning (4K-skärmar)
ALTER TABLE "Snap" ADD COLUMN "scale" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "Snap_url_width_height_key";
CREATE UNIQUE INDEX "Snap_url_width_height_scale_key" ON "Snap"("url", "width", "height", "scale");
