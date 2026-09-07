-- ============================================
-- Scraper classification (keyword-based, no AI) + cycle/history support
-- Run this in Supabase SQL Editor. Fully idempotent — safe to re-run.
-- ============================================

-- 1. Classification columns on scraper_posts
ALTER TABLE scraper_posts ADD COLUMN IF NOT EXISTS role_category TEXT;
ALTER TABLE scraper_posts ADD COLUMN IF NOT EXISTS seniority_level TEXT;
ALTER TABLE scraper_posts ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

-- 2. Same three columns on community_posts (populated at promotion time, so
--    the "Para ti" feed can filter/match without joining back to scraper_posts)
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS role_category TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS seniority_level TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

-- 3. Candidate's desired role category (users.seniority/skills already exist
--    from the onboarding migration; role_category is new)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_category TEXT;

-- 4. Classification trigger function — fires on INSERT and whenever `text`
--    is rewritten (insertPost()'s upsert overwrites text on every re-scrape,
--    so a job's classification self-corrects if its listing changes).
CREATE OR REPLACE FUNCTION classify_scraper_post()
RETURNS TRIGGER AS $$
DECLARE
  computed_skills jsonb;
BEGIN
  -- seniority_level
  NEW.seniority_level := CASE
    WHEN NEW.text ILIKE '%senior%' OR NEW.text ILIKE '%sr.%' OR NEW.text ILIKE '% lead %' THEN 'senior'
    WHEN NEW.text ILIKE '%junior%' OR NEW.text ILIKE '%jr.%' OR NEW.text ILIKE '%trainee%' OR NEW.text ILIKE '%intern%' OR NEW.text ILIKE '%becari%' THEN 'junior'
    ELSE 'semi_senior'
  END;

  -- role_category
  NEW.role_category := CASE
    WHEN NEW.text ILIKE '%full stack%' OR NEW.text ILIKE '%fullstack%' THEN 'fullstack'
    WHEN NEW.text ILIKE '%devops%' OR NEW.text ILIKE '%sre%' THEN 'devops'
    WHEN NEW.text ILIKE '%data scientist%' OR NEW.text ILIKE '%machine learning%' OR NEW.text ILIKE '%research scientist%' OR NEW.text ILIKE '% ml %' OR NEW.text ILIKE '%data analyst%' THEN 'data_scientist'
    WHEN NEW.text ILIKE '%data engineer%' THEN 'data_engineer'
    WHEN NEW.text ILIKE '%qa%' OR NEW.text ILIKE '%quality assurance%' THEN 'qa'
    WHEN NEW.text ILIKE '%ux%' OR NEW.text ILIKE '%ui designer%' OR NEW.text ILIKE '%designer%' OR NEW.text ILIKE '%diseñador%' OR NEW.text ILIKE '%brand design%' OR NEW.text ILIKE '%graphic design%' THEN 'ux_ui'
    WHEN NEW.text ILIKE '%product manager%' THEN 'product'
    WHEN NEW.text ILIKE '%ios%' OR NEW.text ILIKE '%android%' OR NEW.text ILIKE '%react native%' THEN 'mobile'
    WHEN NEW.text ILIKE '%frontend%' OR NEW.text ILIKE '%front-end%' THEN 'frontend'
    WHEN NEW.text ILIKE '%backend%' OR NEW.text ILIKE '%back-end%' THEN 'backend'
    WHEN NEW.text ILIKE '%marketing%' OR NEW.text ILIKE '%growth marketing%' OR NEW.text ILIKE '%seo %'
      OR NEW.text ILIKE '%content marketing%' OR NEW.text ILIKE '%content writer%'
      OR NEW.text ILIKE '%content strategist%' OR NEW.text ILIKE '%content creator%' THEN 'marketing'
    WHEN NEW.text ILIKE '%customer support%' OR NEW.text ILIKE '%customer success%' OR NEW.text ILIKE '%atención al cliente%' OR NEW.text ILIKE '%soporte al cliente%' THEN 'customer_support'
    ELSE NULL
  END;

  -- skills
  SELECT COALESCE(jsonb_agg(skill), '[]'::jsonb) INTO computed_skills FROM (
    SELECT unnest(ARRAY[
      CASE WHEN NEW.text ILIKE '%react%' THEN 'react' END,
      CASE WHEN NEW.text ILIKE '%typescript%' THEN 'typescript' END,
      CASE WHEN NEW.text ILIKE '%next.js%' OR NEW.text ILIKE '%nextjs%' THEN 'nextjs' END,
      CASE WHEN NEW.text ILIKE '%python%' THEN 'python' END,
      CASE WHEN NEW.text ILIKE '%node%' THEN 'nodejs' END,
      CASE WHEN NEW.text ILIKE '%aws%' THEN 'aws' END,
      CASE WHEN NEW.text ILIKE '%docker%' THEN 'docker' END,
      CASE WHEN NEW.text ILIKE '%kubernetes%' THEN 'kubernetes' END,
      CASE WHEN NEW.text ILIKE '%sql%' THEN 'sql' END,
      CASE WHEN NEW.text ILIKE '%golang%' OR NEW.text ILIKE '% go %' THEN 'golang' END,
      CASE WHEN NEW.text ILIKE '%machine learning%' OR NEW.text ILIKE '%inteligencia artificial%' OR NEW.text ILIKE '% ai %' THEN 'ia' END,
      CASE WHEN NEW.text ILIKE '%figma%' THEN 'figma' END,
      CASE WHEN NEW.text ILIKE '%adobe xd%' OR NEW.text ILIKE '%illustrator%' OR NEW.text ILIKE '%photoshop%' THEN 'adobe-suite' END,
      CASE WHEN NEW.text ILIKE '%sketch%' THEN 'sketch' END,
      CASE WHEN NEW.text ILIKE '%seo%' THEN 'seo' END,
      CASE WHEN NEW.text ILIKE '%google ads%' OR NEW.text ILIKE '%sem %' THEN 'google-ads' END,
      CASE WHEN NEW.text ILIKE '%google analytics%' THEN 'google-analytics' END,
      CASE WHEN NEW.text ILIKE '%hubspot%' THEN 'hubspot' END,
      CASE WHEN NEW.text ILIKE '%salesforce%' THEN 'salesforce' END,
      CASE WHEN NEW.text ILIKE '%zendesk%' THEN 'zendesk' END,
      CASE WHEN NEW.text ILIKE '%intercom%' THEN 'intercom' END,
      CASE WHEN NEW.text ILIKE '%excel%' THEN 'excel' END,
      CASE WHEN NEW.text ILIKE '%canva%' THEN 'canva' END,
      CASE WHEN NEW.text ILIKE '%java%' AND NEW.text NOT ILIKE '%javascript%' THEN 'java' END,
      CASE WHEN NEW.text ILIKE '%c#%' OR NEW.text ILIKE '%.net%' THEN 'dotnet' END,
      CASE WHEN NEW.text ILIKE '%ruby%' THEN 'ruby' END,
      CASE WHEN NEW.text ILIKE '%php%' THEN 'php' END,
      CASE WHEN NEW.text ILIKE '%swift%' THEN 'swift' END,
      CASE WHEN NEW.text ILIKE '%kotlin%' THEN 'kotlin' END,
      CASE WHEN NEW.text ILIKE '%angular%' THEN 'angular' END,
      CASE WHEN NEW.text ILIKE '%vue%' THEN 'vue' END,
      CASE WHEN NEW.text ILIKE '%graphql%' THEN 'graphql' END,
      CASE WHEN NEW.text ILIKE '%postgres%' THEN 'postgresql' END,
      CASE WHEN NEW.text ILIKE '%mongodb%' THEN 'mongodb' END,
      CASE WHEN NEW.text ILIKE '%terraform%' THEN 'terraform' END,
      CASE WHEN NEW.text ILIKE '%gcp%' OR NEW.text ILIKE '%google cloud%' THEN 'gcp' END,
      CASE WHEN NEW.text ILIKE '%azure%' THEN 'azure' END
    ]) AS skill
  ) t WHERE skill IS NOT NULL;

  NEW.skills := computed_skills;

  -- spam (OR'd with whatever was already set — never downgrades an explicit true)
  NEW.is_spam := COALESCE(NEW.is_spam, false) OR (
    LENGTH(NEW.text) < 50 OR NEW.text ILIKE '%channel created%' OR NEW.text ILIKE '%joined the group%'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS classify_before_insert_or_update ON scraper_posts;
CREATE TRIGGER classify_before_insert_or_update
  BEFORE INSERT OR UPDATE OF text ON scraper_posts
  FOR EACH ROW EXECUTE FUNCTION classify_scraper_post();

-- 5. Cycle state — anchors the 15-day Production/safety-sweep cycle
CREATE TABLE IF NOT EXISTS scraper_cycle_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  cycle_started_at TIMESTAMPTZ,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO scraper_cycle_state (id, cycle_started_at)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

-- 6. Personal vacancy history — denormalized snapshot, never touched by the
--    scraper's own retention/sweep logic. Survives scraper_posts deletions.
CREATE TABLE IF NOT EXISTS user_vacancy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- 'scraper' | 'community'
  source_id TEXT NOT NULL,
  title TEXT,
  company TEXT,
  company_logo TEXT,
  role_category TEXT,
  seniority_level TEXT,
  skills JSONB,
  url TEXT,
  seen_at TIMESTAMPTZ DEFAULT now(),
  is_saved BOOLEAN DEFAULT false,
  saved_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_vacancy_history_unique') THEN
    ALTER TABLE user_vacancy_history
      ADD CONSTRAINT user_vacancy_history_unique UNIQUE (user_id, source_type, source_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
