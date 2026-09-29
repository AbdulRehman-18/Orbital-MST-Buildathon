CREATE TABLE "account_profiles" (
	"address" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
