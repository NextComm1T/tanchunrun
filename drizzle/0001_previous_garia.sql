CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"version" text NOT NULL,
	"agreed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "consents_user_type_version_unique" UNIQUE("user_id","consent_type","version"),
	CONSTRAINT "consents_consent_type_check" CHECK ("consents"."consent_type" in ('privacy_collection_use'))
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_user_id_idx" ON "consents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_nickname_lower_unique" ON "users" USING btree (lower("nickname"));