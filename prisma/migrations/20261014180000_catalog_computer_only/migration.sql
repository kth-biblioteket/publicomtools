-- Nycklar som bara får sättas på en enskild dator (visningsnamn, resurs-id), aldrig i profiler eller grundinställningar
ALTER TABLE "ConfigKey" ADD COLUMN "computerOnly" BOOLEAN NOT NULL DEFAULT false;
