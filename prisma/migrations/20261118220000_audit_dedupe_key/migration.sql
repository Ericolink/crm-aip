-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_dedupeKey_key" ON "audit_logs"("dedupeKey");
