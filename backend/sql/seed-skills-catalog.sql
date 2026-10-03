-- ============================================
-- Siembra del catálogo de skills (solo datos, idempotente)
-- Run this in Supabase SQL Editor del proyecto que usa el backend desplegado.
--
-- Para qué sirve: las migraciones se aplican a mano y, si la base desplegada
-- se creó sin sembrar `skills` y `skill_aliases`, GET /api/community/skills
-- responde vacío y nadie puede elegir skills. Las tablas ya deben existir
-- (exam-questions-migration.sql y account-foundation-migration.sql).
--
-- Se puede correr varias veces: ON CONFLICT DO NOTHING no duplica nada.
-- Copiado literalmente de esas dos migraciones.
-- ============================================

-- 1. Los 37 skills
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

-- 2. Alias de los skills (deben ir DESPUÉS: apuntan a skills.name)
INSERT INTO skill_aliases (alias_key, skill_name) VALUES
  ('reactjs', 'react'),
  ('node', 'nodejs'),
  ('next', 'nextjs'),
  ('ts', 'typescript'),
  ('py', 'python'),
  ('postgres', 'postgresql'),
  ('psql', 'postgresql'),
  ('k8s', 'kubernetes'),
  ('kube', 'kubernetes'),
  ('ml', 'ia'),
  ('machinelearning', 'ia'),
  ('ai', 'ia'),
  ('net', 'dotnet'),
  ('aspnet', 'dotnet'),
  ('gcloud', 'gcp'),
  ('googlecloud', 'gcp'),
  ('amazonwebservices', 'aws'),
  ('vuejs', 'vue'),
  ('angularjs', 'angular'),
  ('golang', 'golang'),
  ('mongo', 'mongodb'),
  ('tf', 'terraform'),
  ('ga', 'google-analytics'),
  ('adwords', 'google-ads'),
  ('adobe', 'adobe-suite'),
  ('photoshop', 'adobe-suite')
ON CONFLICT (alias_key) DO NOTHING;

-- Verificación: debe dar 37 y un número mayor que cero
SELECT (SELECT count(*) FROM skills) AS skills, (SELECT count(*) FROM skill_aliases) AS aliases;
