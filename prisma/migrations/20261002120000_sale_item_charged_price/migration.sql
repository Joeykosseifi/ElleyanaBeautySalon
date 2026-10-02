-- Per-sale price overrides and one-off custom services.
--
-- Distinguish the catalog price at the time of sale ("standard") from the price
-- actually charged. Existing rows were always charged the standard price, so the
-- charged price is back-filled from it.

ALTER TABLE "SaleItem" DROP CONSTRAINT "SaleItem_line_total_consistent";
ALTER TABLE "SaleItem" DROP CONSTRAINT "SaleItem_price_nonnegative";

ALTER TABLE "SaleItem" RENAME COLUMN "servicePriceSnapshotCents" TO "standardPriceSnapshotCents";
ALTER TABLE "SaleItem" ALTER COLUMN "standardPriceSnapshotCents" DROP NOT NULL;

ALTER TABLE "SaleItem" ADD COLUMN "unitPriceChargedCents" INTEGER;
UPDATE "SaleItem" SET "unitPriceChargedCents" = "standardPriceSnapshotCents";
ALTER TABLE "SaleItem" ALTER COLUMN "unitPriceChargedCents" SET NOT NULL;

ALTER TABLE "SaleItem" ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_price_nonnegative"
  CHECK ("unitPriceChargedCents" >= 0
     AND "serviceCostSnapshotCents" >= 0
     AND ("standardPriceSnapshotCents" IS NULL OR "standardPriceSnapshotCents" >= 0));
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_line_total_consistent"
  CHECK ("lineTotalCents" = "unitPriceChargedCents" * "quantity");
-- A catalog line always records its standard price; a custom line never has one.
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_custom_consistent"
  CHECK (("isCustom" AND "standardPriceSnapshotCents" IS NULL)
      OR (NOT "isCustom" AND "standardPriceSnapshotCents" IS NOT NULL));
-- Keep custom names meaningful.
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_name_not_blank" CHECK (length(btrim("serviceNameSnapshot")) > 0);
