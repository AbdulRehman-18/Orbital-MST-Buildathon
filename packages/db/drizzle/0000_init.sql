CREATE TABLE "departments" (
	"id" smallint PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "wards" (
	"id" integer PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_kn" text NOT NULL,
	"name_ta" text NOT NULL,
	"name_hi" text NOT NULL,
	"city" text NOT NULL,
	"geojson" jsonb
);
--> statement-breakpoint
CREATE TABLE "account_roles" (
	"address" text NOT NULL,
	"role" text NOT NULL,
	"granted_block" bigint NOT NULL,
	CONSTRAINT "account_roles_address_role_pk" PRIMARY KEY("address","role")
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"tender_id" bigint NOT NULL,
	"bidder_addr" text NOT NULL,
	"commit_hash" text NOT NULL,
	"revealed_amount" numeric(78, 0),
	"revealed_at" timestamp with time zone,
	"committed_tx" text NOT NULL,
	CONSTRAINT "bids_tender_id_bidder_addr_pk" PRIMARY KEY("tender_id","bidder_addr")
);
--> statement-breakpoint
CREATE TABLE "citizen_signers" (
	"signer" text PRIMARY KEY NOT NULL,
	"citizen_hash" text NOT NULL,
	"updated_block" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grievance_upvotes" (
	"grievance_id" bigint NOT NULL,
	"citizen_hash" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block" bigint NOT NULL,
	CONSTRAINT "grievance_upvotes_grievance_id_citizen_hash_pk" PRIMARY KEY("grievance_id","citizen_hash")
);
--> statement-breakpoint
CREATE TABLE "grievances" (
	"id" bigint PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"citizen_hash" text NOT NULL,
	"category" text NOT NULL,
	"cid" text NOT NULL,
	"status" text NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"action" text DEFAULT 'NONE' NOT NULL,
	"response_cid" text,
	"responded_by" text,
	"escalated_at" timestamp with time zone,
	"respond_by" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"created_tx" text NOT NULL,
	"updated_block" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_approvals" (
	"milestone_id" bigint NOT NULL,
	"round" integer NOT NULL,
	"auditor_addr" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block" bigint NOT NULL,
	CONSTRAINT "milestone_approvals_milestone_id_round_auditor_addr_pk" PRIMARY KEY("milestone_id","round","auditor_addr")
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" bigint PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"title" text,
	"description" text,
	"meta_cid" text NOT NULL,
	"meta_hash" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"status" text NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"proof_cid" text,
	"proof_hash" text,
	"proof_lat_e6" integer,
	"proof_lng_e6" integer,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"approval_count" smallint DEFAULT 0 NOT NULL,
	"rejection_reason_hash" text,
	"paid_tx" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"created_tx" text NOT NULL,
	"updated_block" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_approvals" (
	"project_id" bigint NOT NULL,
	"auditor_addr" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block" bigint NOT NULL,
	CONSTRAINT "project_approvals_project_id_auditor_addr_pk" PRIMARY KEY("project_id","auditor_addr")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" bigint PRIMARY KEY NOT NULL,
	"meta_cid" text NOT NULL,
	"meta_hash" text NOT NULL,
	"title" text,
	"description" text,
	"category" text NOT NULL,
	"ward_id" integer NOT NULL,
	"dept_id" smallint NOT NULL,
	"lat_e6" integer NOT NULL,
	"lng_e6" integer NOT NULL,
	"budget" numeric(78, 0) NOT NULL,
	"spent" numeric(78, 0) DEFAULT '0' NOT NULL,
	"funded" numeric(78, 0) DEFAULT '0' NOT NULL,
	"status" text NOT NULL,
	"official_addr" text NOT NULL,
	"contractor_addr" text,
	"approval_threshold" smallint NOT NULL,
	"approval_count" smallint DEFAULT 0 NOT NULL,
	"milestone_count" integer DEFAULT 0 NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_tx" text NOT NULL,
	"created_block" bigint NOT NULL,
	"updated_block" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenders" (
	"id" bigint PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"official_addr" text NOT NULL,
	"meta_cid" text NOT NULL,
	"status" text NOT NULL,
	"commit_deadline" timestamp with time zone NOT NULL,
	"reveal_deadline" timestamp with time zone NOT NULL,
	"bid_count" integer DEFAULT 0 NOT NULL,
	"revealed_count" integer DEFAULT 0 NOT NULL,
	"awarded_to" text,
	"winning_bid" numeric(78, 0),
	"cancel_reason_hash" text,
	"created_tx" text NOT NULL,
	"updated_block" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ward_access" (
	"address" text NOT NULL,
	"ward_id" bigint NOT NULL,
	"updated_block" bigint NOT NULL,
	CONSTRAINT "ward_access_address_ward_id_pk" PRIMARY KEY("address","ward_id")
);
--> statement-breakpoint
CREATE TABLE "chain_events" (
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"block_time" timestamp with time zone,
	"contract" text NOT NULL,
	"event_name" text NOT NULL,
	"args" jsonb NOT NULL,
	"confirmed" boolean NOT NULL,
	CONSTRAINT "chain_events_tx_hash_log_index_pk" PRIMARY KEY("tx_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE "indexer_cursor" (
	"network" text PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"last_block_hash" text,
	"head_block" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_txs" (
	"tx_hash" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"entity_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"block_number" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" bigint NOT NULL,
	"rule" text NOT NULL,
	"severity" text NOT NULL,
	"details" jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"request_id" text,
	"ip_hash" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "otp_sessions" (
	"phone_hash" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"sent_count" smallint DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pinned_metadata" (
	"cid" text PRIMARY KEY NOT NULL,
	"meta_hash" text NOT NULL,
	"kind" text NOT NULL,
	"body" jsonb NOT NULL,
	"pinned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"milestone_id" bigint NOT NULL,
	"cid" text NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer,
	"height" integer,
	"exif_lat" real,
	"exif_lng" real,
	"exif_time" timestamp with time zone,
	"gps_distance_m" real,
	"flagged" boolean DEFAULT false NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relayer_txs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"citizen_hash" text,
	"cid" text,
	"nonce" integer,
	"tx_hash" text,
	"replaced_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gas_price" numeric(78, 0),
	"fee_wei" numeric(78, 0),
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text,
	"phone_hash" text,
	"role" text NOT NULL,
	"ward_id" integer,
	"dept_id" smallint,
	"display_name" text,
	"preferred_lang" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "users_phone_hash_unique" UNIQUE("phone_hash")
);
--> statement-breakpoint
CREATE INDEX "grievances_project_idx" ON "grievances" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "milestones_project_idx" ON "milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "milestones_status_idx" ON "milestones" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_ward_idx" ON "projects" USING btree ("ward_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenders_project_idx" ON "tenders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "chain_events_block_idx" ON "chain_events" USING btree ("block_number","log_index");--> statement-breakpoint
CREATE INDEX "chain_events_confirmed_idx" ON "chain_events" USING btree ("confirmed");--> statement-breakpoint
CREATE INDEX "pending_txs_status_idx" ON "pending_txs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "anomalies_project_idx" ON "anomalies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "proof_media_milestone_idx" ON "proof_media" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "relayer_txs_created_idx" ON "relayer_txs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "relayer_txs_citizen_idx" ON "relayer_txs" USING btree ("citizen_hash");--> statement-breakpoint
CREATE INDEX "relayer_txs_job_idx" ON "relayer_txs" USING btree ("job_id");