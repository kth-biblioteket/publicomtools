-- Datortyperna (COMPUTER_TYPE) en nyckel gäller för; tom lista = alla
ALTER TABLE "ConfigKey" ADD COLUMN "types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
