-- Nycklar som hör till den enskilda datorn (namn, resurs-id …) och står kvar när datorn byter profil
ALTER TABLE "ConfigKey" ADD COLUMN "perComputer" BOOLEAN NOT NULL DEFAULT false;
