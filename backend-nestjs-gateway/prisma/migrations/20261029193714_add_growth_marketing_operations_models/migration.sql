-- CreateTable
CREATE TABLE "ai"."equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "equipment_type" VARCHAR(100) NOT NULL,
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "serial_number" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'available',
    "purchase_date" TIMESTAMPTZ(6),
    "warranty_expiry" TIMESTAMPTZ(6),
    "last_maintenance_at" TIMESTAMPTZ(6),
    "next_maintenance_at" TIMESTAMPTZ(6),
    "location" VARCHAR(200),
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."equipment_maintenance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "maintenance_type" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "estimated_duration_min" INTEGER NOT NULL,
    "actual_duration_min" INTEGER,
    "assigned_to" UUID,
    "cost" INTEGER,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."referral_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "referrer_incentive_type" VARCHAR(40) NOT NULL,
    "referrer_incentive_value" INTEGER NOT NULL,
    "referrer_incentive_description" VARCHAR(200) NOT NULL,
    "referee_incentive_type" VARCHAR(40),
    "referee_incentive_value" INTEGER,
    "referee_incentive_description" VARCHAR(200),
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "max_referrals_per_member" INTEGER NOT NULL DEFAULT 10,
    "eligibility_criteria" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."referrals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "referrer_member_id" UUID NOT NULL,
    "referee_lead_id" UUID,
    "referee_member_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "referred_at" TIMESTAMPTZ(6) NOT NULL,
    "converted_at" TIMESTAMPTZ(6),
    "referrer_reward_paid" BOOLEAN NOT NULL DEFAULT false,
    "referee_reward_paid" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."upsell_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "member_id" UUID,
    "segment_id" UUID,
    "offer_type" VARCHAR(40) NOT NULL,
    "offer_details" JSONB NOT NULL,
    "discount_percent" INTEGER,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "trigger_event" VARCHAR(40),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "redeemed_at" TIMESTAMPTZ(6),
    "redeemed_by" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upsell_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."growth_experiments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "variant_control" JSONB NOT NULL,
    "variant_treatment" JSONB NOT NULL,
    "target_metric" VARCHAR(40) NOT NULL,
    "minimum_detectable_effect" DOUBLE PRECISION NOT NULL,
    "traffic_allocation" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6),
    "results" JSONB DEFAULT '{}',
    "significance_level" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."experiment_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "experiment_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "variant" VARCHAR(20) NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL,
    "converted_at" TIMESTAMPTZ(6),
    "metric_value" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."marketing_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "channel" VARCHAR(20) NOT NULL,
    "objective" VARCHAR(20) NOT NULL,
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "creative" JSONB NOT NULL DEFAULT '{}',
    "budget_type" VARCHAR(20) NOT NULL,
    "budget_amount" DOUBLE PRECISION NOT NULL,
    "budget_currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "budget_spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "schedule_start" TIMESTAMPTZ(6) NOT NULL,
    "schedule_end" TIMESTAMPTZ(6),
    "dayparting" JSONB NOT NULL DEFAULT '[]',
    "landing_page_url" TEXT,
    "utm_params" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."audience_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "segment_type" VARCHAR(30) NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "source_segment_id" UUID,
    "lookalike_config" JSONB NOT NULL DEFAULT '{}',
    "estimated_size" INTEGER NOT NULL DEFAULT 0,
    "last_refreshed_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audience_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."content_calendar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "content_type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200),
    "body" TEXT NOT NULL,
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "target_segments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "utm_params" JSONB NOT NULL DEFAULT '{}',
    "ab_test_variant" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "external_id" VARCHAR(100),
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "author_name" VARCHAR(200) NOT NULL,
    "author_profile_url" TEXT,
    "rating" REAL NOT NULL,
    "title" VARCHAR(300),
    "content" TEXT NOT NULL,
    "sentiment" VARCHAR(20) NOT NULL,
    "language" VARCHAR(10),
    "response" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "responded_by" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."competitors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "distance_km" REAL,
    "website" TEXT,
    "phone" VARCHAR(30),
    "class_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pricing" JSONB NOT NULL DEFAULT '{}',
    "ratings" JSONB NOT NULL DEFAULT '{}',
    "reviews_count" INTEGER NOT NULL DEFAULT 0,
    "last_scraped_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_tenant_id_branch_id_idx" ON "ai"."equipment"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "equipment_tenant_id_status_idx" ON "ai"."equipment"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "equipment_tenant_id_equipment_type_idx" ON "ai"."equipment"("tenant_id", "equipment_type");

-- CreateIndex
CREATE INDEX "equipment_maintenance_tenant_id_equipment_id_idx" ON "ai"."equipment_maintenance"("tenant_id", "equipment_id");

-- CreateIndex
CREATE INDEX "equipment_maintenance_tenant_id_status_idx" ON "ai"."equipment_maintenance"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "equipment_maintenance_tenant_id_scheduled_at_idx" ON "ai"."equipment_maintenance"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "referral_campaigns_tenant_id_status_idx" ON "ai"."referral_campaigns"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "referral_campaigns_tenant_id_valid_from_valid_until_idx" ON "ai"."referral_campaigns"("tenant_id", "valid_from", "valid_until");

-- CreateIndex
CREATE INDEX "referrals_tenant_id_campaign_id_idx" ON "ai"."referrals"("tenant_id", "campaign_id");

-- CreateIndex
CREATE INDEX "referrals_tenant_id_referrer_member_id_idx" ON "ai"."referrals"("tenant_id", "referrer_member_id");

-- CreateIndex
CREATE INDEX "referrals_tenant_id_referee_lead_id_idx" ON "ai"."referrals"("tenant_id", "referee_lead_id");

-- CreateIndex
CREATE INDEX "referrals_tenant_id_referee_member_id_idx" ON "ai"."referrals"("tenant_id", "referee_member_id");

-- CreateIndex
CREATE INDEX "referrals_tenant_id_status_idx" ON "ai"."referrals"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "upsell_offers_tenant_id_member_id_idx" ON "ai"."upsell_offers"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "upsell_offers_tenant_id_segment_id_idx" ON "ai"."upsell_offers"("tenant_id", "segment_id");

-- CreateIndex
CREATE INDEX "upsell_offers_tenant_id_status_idx" ON "ai"."upsell_offers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "upsell_offers_tenant_id_valid_until_idx" ON "ai"."upsell_offers"("tenant_id", "valid_until");

-- CreateIndex
CREATE INDEX "growth_experiments_tenant_id_status_idx" ON "ai"."growth_experiments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "growth_experiments_tenant_id_start_date_end_date_idx" ON "ai"."growth_experiments"("tenant_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "experiment_enrollments_tenant_id_experiment_id_idx" ON "ai"."experiment_enrollments"("tenant_id", "experiment_id");

-- CreateIndex
CREATE INDEX "experiment_enrollments_tenant_id_member_id_idx" ON "ai"."experiment_enrollments"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "experiment_enrollments_tenant_id_variant_idx" ON "ai"."experiment_enrollments"("tenant_id", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_enrollments_tenant_id_experiment_id_member_id_key" ON "ai"."experiment_enrollments"("tenant_id", "experiment_id", "member_id");

-- CreateIndex
CREATE INDEX "marketing_campaigns_tenant_id_status_idx" ON "ai"."marketing_campaigns"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "marketing_campaigns_tenant_id_channel_idx" ON "ai"."marketing_campaigns"("tenant_id", "channel");

-- CreateIndex
CREATE INDEX "marketing_campaigns_tenant_id_schedule_start_schedule_end_idx" ON "ai"."marketing_campaigns"("tenant_id", "schedule_start", "schedule_end");

-- CreateIndex
CREATE INDEX "audience_segments_tenant_id_segment_type_idx" ON "ai"."audience_segments"("tenant_id", "segment_type");

-- CreateIndex
CREATE INDEX "audience_segments_tenant_id_status_idx" ON "ai"."audience_segments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "content_calendar_tenant_id_channel_idx" ON "ai"."content_calendar"("tenant_id", "channel");

-- CreateIndex
CREATE INDEX "content_calendar_tenant_id_scheduled_at_idx" ON "ai"."content_calendar"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "content_calendar_tenant_id_status_idx" ON "ai"."content_calendar"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "reviews_tenant_id_platform_idx" ON "ai"."reviews"("tenant_id", "platform");

-- CreateIndex
CREATE INDEX "reviews_tenant_id_status_idx" ON "ai"."reviews"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "reviews_tenant_id_sentiment_idx" ON "ai"."reviews"("tenant_id", "sentiment");

-- CreateIndex
CREATE INDEX "reviews_tenant_id_fetched_at_idx" ON "ai"."reviews"("tenant_id", "fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_tenant_id_platform_external_id_key" ON "ai"."reviews"("tenant_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "competitors_tenant_id_is_active_idx" ON "ai"."competitors"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "competitors_tenant_id_distance_km_idx" ON "ai"."competitors"("tenant_id", "distance_km");

-- AddForeignKey
ALTER TABLE "ai"."equipment" ADD CONSTRAINT "equipment_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "platform"."branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai"."equipment_maintenance" ADD CONSTRAINT "equipment_maintenance_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "ai"."equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai"."referrals" ADD CONSTRAINT "referrals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ai"."referral_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai"."referrals" ADD CONSTRAINT "referrals_referrer_member_id_fkey" FOREIGN KEY ("referrer_member_id") REFERENCES "ops"."studio_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai"."referrals" ADD CONSTRAINT "referrals_referee_lead_id_fkey" FOREIGN KEY ("referee_lead_id") REFERENCES "ops"."studio_leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai"."upsell_offers" ADD CONSTRAINT "upsell_offers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "ops"."studio_members"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai"."upsell_offers" ADD CONSTRAINT "upsell_offers_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "ai"."audience_segments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai"."experiment_enrollments" ADD CONSTRAINT "experiment_enrollments_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "ai"."growth_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai"."experiment_enrollments" ADD CONSTRAINT "experiment_enrollments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "ops"."studio_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- =============================================================================
-- Security Layer: RLS Policies, Updated_At Triggers, and Grants
-- =============================================================================
-- This section adds tenant isolation, automatic updated_at maintenance,
-- and least-privilege grants for the 12 restored AI tables.
-- Prerequisites (must exist in prior migrations):
--   - platform.current_tenant() function (migration 110)
--   - platform.set_updated_at() function (migration 000_bootstrap)
--   - fitness_app_runtime role (migration 130)
--   - Referenced tables: platform.branches, ops.studio_members, ops.studio_leads, ai.audience_segments
-- =============================================================================

-- equipment
ALTER TABLE "ai"."equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."equipment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipment_tenant_isolation ON "ai"."equipment";
CREATE POLICY equipment_tenant_isolation ON "ai"."equipment"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_equipment_updated_at ON "ai"."equipment";
CREATE TRIGGER update_equipment_updated_at
    BEFORE UPDATE ON "ai"."equipment"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- equipment_maintenance
ALTER TABLE "ai"."equipment_maintenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."equipment_maintenance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipment_maintenance_tenant_isolation ON "ai"."equipment_maintenance";
CREATE POLICY equipment_maintenance_tenant_isolation ON "ai"."equipment_maintenance"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_equipment_maintenance_updated_at ON "ai"."equipment_maintenance";
CREATE TRIGGER update_equipment_maintenance_updated_at
    BEFORE UPDATE ON "ai"."equipment_maintenance"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- referral_campaigns
ALTER TABLE "ai"."referral_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."referral_campaigns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_campaigns_tenant_isolation ON "ai"."referral_campaigns";
CREATE POLICY referral_campaigns_tenant_isolation ON "ai"."referral_campaigns"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_referral_campaigns_updated_at ON "ai"."referral_campaigns";
CREATE TRIGGER update_referral_campaigns_updated_at
    BEFORE UPDATE ON "ai"."referral_campaigns"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- referrals
ALTER TABLE "ai"."referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."referrals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_tenant_isolation ON "ai"."referrals";
CREATE POLICY referrals_tenant_isolation ON "ai"."referrals"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_referrals_updated_at ON "ai"."referrals";
CREATE TRIGGER update_referrals_updated_at
    BEFORE UPDATE ON "ai"."referrals"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- upsell_offers
ALTER TABLE "ai"."upsell_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."upsell_offers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upsell_offers_tenant_isolation ON "ai"."upsell_offers";
CREATE POLICY upsell_offers_tenant_isolation ON "ai"."upsell_offers"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_upsell_offers_updated_at ON "ai"."upsell_offers";
CREATE TRIGGER update_upsell_offers_updated_at
    BEFORE UPDATE ON "ai"."upsell_offers"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- growth_experiments
ALTER TABLE "ai"."growth_experiments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."growth_experiments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS growth_experiments_tenant_isolation ON "ai"."growth_experiments";
CREATE POLICY growth_experiments_tenant_isolation ON "ai"."growth_experiments"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_growth_experiments_updated_at ON "ai"."growth_experiments";
CREATE TRIGGER update_growth_experiments_updated_at
    BEFORE UPDATE ON "ai"."growth_experiments"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- experiment_enrollments
ALTER TABLE "ai"."experiment_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."experiment_enrollments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experiment_enrollments_tenant_isolation ON "ai"."experiment_enrollments";
CREATE POLICY experiment_enrollments_tenant_isolation ON "ai"."experiment_enrollments"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_experiment_enrollments_updated_at ON "ai"."experiment_enrollments";
CREATE TRIGGER update_experiment_enrollments_updated_at
    BEFORE UPDATE ON "ai"."experiment_enrollments"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- marketing_campaigns
ALTER TABLE "ai"."marketing_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."marketing_campaigns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_campaigns_tenant_isolation ON "ai"."marketing_campaigns";
CREATE POLICY marketing_campaigns_tenant_isolation ON "ai"."marketing_campaigns"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_marketing_campaigns_updated_at ON "ai"."marketing_campaigns";
CREATE TRIGGER update_marketing_campaigns_updated_at
    BEFORE UPDATE ON "ai"."marketing_campaigns"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- audience_segments
ALTER TABLE "ai"."audience_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."audience_segments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audience_segments_tenant_isolation ON "ai"."audience_segments";
CREATE POLICY audience_segments_tenant_isolation ON "ai"."audience_segments"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_audience_segments_updated_at ON "ai"."audience_segments";
CREATE TRIGGER update_audience_segments_updated_at
    BEFORE UPDATE ON "ai"."audience_segments"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- content_calendar
ALTER TABLE "ai"."content_calendar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."content_calendar" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_calendar_tenant_isolation ON "ai"."content_calendar";
CREATE POLICY content_calendar_tenant_isolation ON "ai"."content_calendar"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_content_calendar_updated_at ON "ai"."content_calendar";
CREATE TRIGGER update_content_calendar_updated_at
    BEFORE UPDATE ON "ai"."content_calendar"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- reviews
ALTER TABLE "ai"."reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."reviews" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reviews_tenant_isolation ON "ai"."reviews";
CREATE POLICY reviews_tenant_isolation ON "ai"."reviews"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_reviews_updated_at ON "ai"."reviews";
CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON "ai"."reviews"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- competitors
ALTER TABLE "ai"."competitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."competitors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS competitors_tenant_isolation ON "ai"."competitors";
CREATE POLICY competitors_tenant_isolation ON "ai"."competitors"
    USING (tenant_id = platform.current_tenant())
    WITH CHECK (tenant_id = platform.current_tenant());
DROP TRIGGER IF EXISTS update_competitors_updated_at ON "ai"."competitors";
CREATE TRIGGER update_competitors_updated_at
    BEFORE UPDATE ON "ai"."competitors"
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- =============================================================================
-- Grants
-- =============================================================================
-- Schema USAGE for ai schema (required for table access)
GRANT USAGE ON SCHEMA ai TO CURRENT_USER;

-- Table privileges for application user (wsos via CURRENT_USER)
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."equipment" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."equipment_maintenance" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."referral_campaigns" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."referrals" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."upsell_offers" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."growth_experiments" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."experiment_enrollments" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."marketing_campaigns" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."audience_segments" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."content_calendar" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."reviews" TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."competitors" TO CURRENT_USER;

-- Least-privilege grants for fitness_app_runtime role (migration 130)
-- This role is NOLOGIN, NOBYPASSRLS and used by the application runtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."equipment" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."equipment_maintenance" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."referral_campaigns" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."referrals" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."upsell_offers" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."growth_experiments" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."experiment_enrollments" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."marketing_campaigns" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."audience_segments" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."content_calendar" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."reviews" TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."competitors" TO fitness_app_runtime;
  END IF;
END $$;

-- Note: fitness_worker_runtime and fitness_webhook_ingest are not granted access
-- to these tables as there is no evidence they are required by background workers
-- or webhook ingestion. Add grants only when service code requires them.
-- Note: Sequence grants are not needed as all tables use gen_random_uuid() defaults.