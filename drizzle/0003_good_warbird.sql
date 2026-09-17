CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"tokens" numeric NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limits_kind_check" CHECK ("rate_limits"."kind" in ('points', 'finish')),
	CONSTRAINT "rate_limits_subject_check" CHECK (("rate_limits"."user_id" is null) <> ("rate_limits"."session_id" is null))
);
--> statement-breakpoint
CREATE TABLE "route_points" (
	"session_id" uuid NOT NULL,
	"tracker_generation" integer NOT NULL,
	"raw_seq" integer NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"segment" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"accuracy_m" double precision,
	"in_zone" boolean,
	"excluded_from_prev_reason" text,
	CONSTRAINT "route_points_session_id_tracker_generation_raw_seq_ordinal_pk" PRIMARY KEY("session_id","tracker_generation","raw_seq","ordinal"),
	CONSTRAINT "route_points_raw_seq_check" CHECK ("route_points"."raw_seq" >= 1),
	CONSTRAINT "route_points_ordinal_check" CHECK ("route_points"."ordinal" >= 0),
	CONSTRAINT "route_points_segment_check" CHECK ("route_points"."segment" >= 0),
	CONSTRAINT "route_points_kind_check" CHECK ("route_points"."kind" in ('measured', 'boundary')),
	CONSTRAINT "route_points_excluded_reason_check" CHECK ("route_points"."excluded_from_prev_reason" is null or "route_points"."excluded_from_prev_reason" in ('speed'))
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_session_id_run_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."run_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_session_id_run_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."run_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_kind_user_unique" ON "rate_limits" USING btree ("kind","user_id") WHERE "rate_limits"."session_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_kind_session_unique" ON "rate_limits" USING btree ("kind","session_id") WHERE "rate_limits"."user_id" is null;