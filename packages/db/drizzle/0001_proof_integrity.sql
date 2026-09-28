ALTER TABLE "proof_media" ADD COLUMN "phash" text;--> statement-breakpoint
ALTER TABLE "proof_media" ADD COLUMN "thumb_cid" text;--> statement-breakpoint
ALTER TABLE "proof_media" ADD COLUMN "checks" jsonb;