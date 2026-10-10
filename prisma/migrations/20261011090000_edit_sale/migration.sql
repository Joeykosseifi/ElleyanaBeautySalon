-- Edit Sale: per-line employees, edit timestamp and an append-only edit history.
-- Additive only: no existing row is deleted, and money/payment data is not touched.

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "SaleRevision" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,

    CONSTRAINT "SaleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleRevision_saleId_createdAt_idx" ON "SaleRevision"("saleId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleItem_employeeId_idx" ON "SaleItem"("employeeId");

-- AddForeignKey
ALTER TABLE "SaleRevision" ADD CONSTRAINT "SaleRevision_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRevision" ADD CONSTRAINT "SaleRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Every existing line was performed by the sale's employee: copy it onto the lines so
-- employee reports stay exactly the same after the upgrade.
UPDATE "SaleItem" si SET "employeeId" = s."employeeId"
FROM "Sale" s
WHERE si."saleId" = s.id AND si."employeeId" IS NULL AND s."employeeId" IS NOT NULL;
