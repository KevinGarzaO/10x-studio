-- ============================================
-- Candidate profile essentials - Migration
-- Run this in Supabase SQL Editor
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT;       -- e.g. "Backend Developer"
ALTER TABLE users ADD COLUMN IF NOT EXISTS seniority TEXT;   -- 'junior' | 'semi_senior' | 'senior'
