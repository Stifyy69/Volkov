-- AddFamilyDiscounts
-- Add discount columns to Family table for drill and tax discounts

ALTER TABLE "Family" ADD COLUMN "discountDrill" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Family" ADD COLUMN "discountTax" INTEGER NOT NULL DEFAULT 0;