ALTER TABLE "groups" ADD COLUMN "invite_token" varchar(64);--> statement-breakpoint
UPDATE "groups" SET "invite_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "invite_token" IS NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "invite_token" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_invite_token_uq" ON "groups" USING btree ("invite_token");
