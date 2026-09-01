-- Add refresh token and expiry columns to linkedin_profiles
-- Run this in Supabase SQL Editor

ALTER TABLE linkedin_profiles 
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ DEFAULT NOW();
