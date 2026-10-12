CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"book_type" varchar(50) DEFAULT 'reclamos' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_books_business_id" ON "books" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_books_establishment_id" ON "books" USING btree ("establishment_id");