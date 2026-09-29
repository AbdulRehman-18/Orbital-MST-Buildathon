CREATE TABLE "archived_projects" (
	"project_id" bigint PRIMARY KEY NOT NULL,
	"archived_by" text NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
