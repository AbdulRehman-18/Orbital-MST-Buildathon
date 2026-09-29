CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text DEFAULT 'phone-verification' NOT NULL,
	"version" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id");