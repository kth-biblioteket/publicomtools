-- Vad en sparning ändrade, för ändringsloggen och "ångra den här ändringen".
ALTER TABLE "ConfigChange" ADD COLUMN "changes" JSONB;
