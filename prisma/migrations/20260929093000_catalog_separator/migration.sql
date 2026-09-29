-- WEBSITES är mellanslagsseparerad, övriga listor kommaseparerade.
ALTER TABLE "ConfigKey" ADD COLUMN "separator" TEXT NOT NULL DEFAULT ',';
