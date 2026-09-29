ALTER TABLE "receipts" ADD COLUMN "share_token" varchar(64);--> statement-breakpoint
UPDATE "receipts" SET "share_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "share_token" IS NULL;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "share_token" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_share_token_uq" ON "receipts" USING btree ("share_token");
