-- ============================================
-- Seed ATS Sources into scraper_sources
-- Run this in Supabase SQL Editor (one-time)
-- ============================================

-- Workable
INSERT INTO scraper_sources (platform, source_id, display_name, is_active, discovered_by, created_at, updated_at)
VALUES
  ('workable', 'platzi', 'platzi', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'crediclub', 'crediclub', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'kavak', 'kavak', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'bitso', 'bitso', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'clip', 'clip', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'jokr', 'jokr', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'nubank', 'nubank', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'mercadolibre', 'mercadolibre', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'rappi', 'rappi', true, 'google_dorking', NOW(), NOW()),
  ('workable', 'dlocal', 'dlocal', true, 'google_dorking', NOW(), NOW())
ON CONFLICT (platform, source_id) DO NOTHING;

-- Greenhouse
INSERT INTO scraper_sources (platform, source_id, display_name, is_active, discovered_by, created_at, updated_at)
VALUES
  ('greenhouse', 'github', 'github', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'gitlab', 'gitlab', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'figma', 'figma', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'notion', 'notion', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'canva', 'canva', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'airtable', 'airtable', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'lastic', 'lastic', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'mural', 'mural', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'loom', 'loom', true, 'google_dorking', NOW(), NOW()),
  ('greenhouse', 'grammarly', 'grammarly', true, 'google_dorking', NOW(), NOW())
ON CONFLICT (platform, source_id) DO NOTHING;

-- Lever
INSERT INTO scraper_sources (platform, source_id, display_name, is_active, discovered_by, created_at, updated_at)
VALUES
  ('lever', 'netlify', 'netlify', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'postman', 'postman', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'calendly', 'calendly', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'upspot', 'upspot', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'lattice', 'lattice', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'greenhouse', 'greenhouse', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'lever', 'lever', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'ashby', 'ashby', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'breezy', 'breezy', true, 'google_dorking', NOW(), NOW()),
  ('lever', 'recruitee', 'recruitee', true, 'google_dorking', NOW(), NOW())
ON CONFLICT (platform,source_id) DO NOTHING;
