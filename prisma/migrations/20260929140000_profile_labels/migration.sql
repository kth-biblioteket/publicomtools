-- Svenska namn på profilerna i admin. Id:t (name) är det datorerna använder och ändras inte.
ALTER TABLE "ConfigLayer" ADD COLUMN "label" TEXT,
ADD COLUMN "description" TEXT;

UPDATE "ConfigLayer" SET "label" = 'Grupprum', "description" = 'Kioskdator för bokning av grupprum och läsesalar' WHERE "kind" = 'profile' AND "name" = 'grouproom';
UPDATE "ConfigLayer" SET "label" = 'Gästdator', "description" = 'Gästdator med inloggning (Alma) och drop in-bokning' WHERE "kind" = 'profile' AND "name" = 'guest-login';
UPDATE "ConfigLayer" SET "label" = 'Sökdator', "description" = 'Sökdator (Primo och Libris)' WHERE "kind" = 'profile' AND "name" = 'search';
UPDATE "ConfigLayer" SET "label" = 'Skylt', "description" = 'Digital skyltning (stående skärm, kioskläge, ingen inloggning)' WHERE "kind" = 'profile' AND "name" = 'signage';
