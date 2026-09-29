-- Namn i admin-listan, skilt från COMPUTER_NAME som visas i datorns panel.
ALTER TABLE "Computer" ADD COLUMN "label" TEXT;
