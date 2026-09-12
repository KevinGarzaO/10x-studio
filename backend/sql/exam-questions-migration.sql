-- ============================================
-- Exam Questions - Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Skills catalog (formalized by this feature — no such table existed
--    before; the catalog previously only lived as CANONICAL_SKILLS in
--    apps/community/lib/profile-options.ts). Follows the same catalog+FK
--    pattern as community_tags in community-hub-migration.sql.
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One-time backfill of the 36 values from CANONICAL_SKILLS. Re-runnable.
INSERT INTO skills (name, label) VALUES
  ('react', 'React'),
  ('typescript', 'TypeScript'),
  ('nextjs', 'Next.js'),
  ('python', 'Python'),
  ('nodejs', 'Node.js'),
  ('aws', 'AWS'),
  ('docker', 'Docker'),
  ('kubernetes', 'Kubernetes'),
  ('sql', 'SQL'),
  ('golang', 'Go'),
  ('ia', 'IA / Machine Learning'),
  ('figma', 'Figma'),
  ('adobe-suite', 'Adobe Suite'),
  ('sketch', 'Sketch'),
  ('seo', 'SEO'),
  ('google-ads', 'Google Ads'),
  ('google-analytics', 'Google Analytics'),
  ('hubspot', 'HubSpot'),
  ('salesforce', 'Salesforce'),
  ('zendesk', 'Zendesk'),
  ('intercom', 'Intercom'),
  ('excel', 'Excel'),
  ('canva', 'Canva'),
  ('java', 'Java'),
  ('dotnet', '.NET'),
  ('ruby', 'Ruby'),
  ('php', 'PHP'),
  ('swift', 'Swift'),
  ('kotlin', 'Kotlin'),
  ('angular', 'Angular'),
  ('vue', 'Vue'),
  ('graphql', 'GraphQL'),
  ('postgresql', 'PostgreSQL'),
  ('mongodb', 'MongoDB'),
  ('terraform', 'Terraform'),
  ('gcp', 'GCP'),
  ('azure', 'Azure')
ON CONFLICT (name) DO NOTHING;

-- 2. Exam questions
CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question VARCHAR(500) NOT NULL,
  skill_name VARCHAR(50) NOT NULL REFERENCES skills(name),
  correct_answer_index SMALLINT NOT NULL CHECK (correct_answer_index >= 0),
  difficulty_level VARCHAR(12) NOT NULL CHECK (difficulty_level IN ('basico', 'intermedio', 'avanzado')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Answer options
CREATE TABLE IF NOT EXISTS question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_question_id UUID NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  text VARCHAR(200) NOT NULL,
  order_index SMALLINT NOT NULL
);

-- 4. Close the DB layer for correct_answer_index's upper bound
--    (a single-table CHECK can't reference question_options' row count).
--    Deferred to end-of-transaction so it validates against the final
--    option count, since the question row is inserted before its options
--    in the same transaction. Same trigger pattern as classify_scraper_post()
--    in scraper-classification-migration.sql.
CREATE OR REPLACE FUNCTION validate_correct_answer_index()
RETURNS TRIGGER AS $$
DECLARE
  option_count INT;
BEGIN
  SELECT count(*) INTO option_count
  FROM question_options
  WHERE exam_question_id = NEW.id;

  IF NEW.correct_answer_index >= option_count THEN
    RAISE EXCEPTION
      'correct_answer_index (%) must be less than the number of options (%) for exam_question %',
      NEW.correct_answer_index, option_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_correct_answer_index_trigger ON exam_questions;
CREATE CONSTRAINT TRIGGER validate_correct_answer_index_trigger
AFTER INSERT ON exam_questions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_correct_answer_index();
