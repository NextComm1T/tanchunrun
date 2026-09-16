CREATE TABLE "run_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"save_state" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"finish_received_at" timestamp with time zone,
	"run_date" date NOT NULL,
	"zone_version" text,
	"total_distance_m" integer,
	"tancheon_distance_m" integer,
	"duration_sec" integer,
	"avg_pace_sec_per_km" integer,
	"rank_snapshot" integer,
	"rank_snapshot_kind" text,
	"pb_flags" text[],
	"saved_at" timestamp with time zone,
	"tracker_generation" integer DEFAULT 1 NOT NULL,
	"tracker_token_hash" text NOT NULL,
	CONSTRAINT "run_sessions_status_check" CHECK ("run_sessions"."status" in ('active', 'finished')),
	CONSTRAINT "run_sessions_save_state_check" CHECK ("run_sessions"."save_state" is null or "run_sessions"."save_state" in ('pending', 'saved', 'failed')),
	CONSTRAINT "run_sessions_tracker_generation_check" CHECK ("run_sessions"."tracker_generation" >= 1)
);
--> statement-breakpoint
ALTER TABLE "run_sessions" ADD CONSTRAINT "run_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_sessions_user_id_idx" ON "run_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_sessions_active_user_unique" ON "run_sessions" USING btree ("user_id") WHERE "run_sessions"."status" = 'active';