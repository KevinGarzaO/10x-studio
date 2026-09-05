-- ============================================
-- Seed ATS Sources (CORRECTED slugs)
-- Run this in Supabase SQL Editor (one-time)
-- ============================================

-- First, deactivate the old wrong Lever entries
UPDATE scraper_sources SET is_active = false WHERE platform = 'lever';

-- Greenhouse (verified working)
INSERT INTO scraper_sources (platform, source_id, display_name, is_active, discovered_by, created_at, updated_at)
VALUES
  ('greenhouse', 'gitlab', 'GitLab', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'figma', 'Figma', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'airtable', 'Airtable', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'discord', 'Discord', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'airbnb', 'Airbnb', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'coinbase', 'Coinbase', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'dropbox', 'Dropbox', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'pinterest', 'Pinterest', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'reddit', 'Reddit', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'instacart', 'Instacart', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'lyft', 'Lyft', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'stripe', 'Stripe', true, 'verified', NOW(), NOW()),
  ('greenhouse', 'twilio', 'Twilio', true, 'verified', NOW(), NOW())
ON CONFLICT (platform, source_id) DO UPDATE SET 
  display_name = EXCLUDED.display_name,
  is_active = true,
  discovered_by = 'verified',
  updated_at = NOW();

-- Workable (verified working)
INSERT INTO scraper_sources (platform, source_id, display_name, is_active, discovered_by, created_at, updated_at)
VALUES
  ('workable', 'platzi', 'Platzi', true, 'verified', NOW(), NOW())
ON CONFLICT (platform, source_id) DO UPDATE SET 
  display_name = EXCLUDED.display_name,
  is_active = true,
  discovered_by = 'verified',
  updated_at = NOW();
