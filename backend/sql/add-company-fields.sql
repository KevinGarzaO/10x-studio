-- Add company fields to scraper_posts
ALTER TABLE scraper_posts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE scraper_posts ADD COLUMN IF NOT EXISTS company_logo TEXT;

-- Add company fields to community_posts
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS company_logo TEXT;

-- Backfill company from content for existing ATS posts
UPDATE scraper_posts 
SET company = CASE 
  WHEN source = 'gitlab' THEN 'GitLab'
  WHEN source = 'platzi' THEN 'Platzi'
  WHEN source = 'figma' THEN 'Figma'
  WHEN source = 'airtable' THEN 'Airtable'
  WHEN source = 'discord' THEN 'Discord'
  WHEN source = 'airbnb' THEN 'Airbnb'
  WHEN source = 'coinbase' THEN 'Coinbase'
  WHEN source = 'dropbox' THEN 'Dropbox'
  WHEN source = 'pinterest' THEN 'Pinterest'
  WHEN source = 'reddit' THEN 'Reddit'
  WHEN source = 'instacart' THEN 'Instacart'
  WHEN source = 'lyft' THEN 'Lyft'
  WHEN source = 'stripe' THEN 'Stripe'
  WHEN source = 'twilio' THEN 'Twilio'
  ELSE INITCAP(source)
END
WHERE company IS NULL AND platform IN ('greenhouse', 'workable');

-- Backfill company in community_posts from scraper_posts
-- community_posts uses source_name (not source) and source_url (not source_post_id)
UPDATE community_posts cp
SET company = sp.company,
    company_logo = sp.company_logo
FROM scraper_posts sp
WHERE cp.platform = sp.platform
  AND cp.source_name = sp.source
  AND cp.source_url = sp.url
  AND cp.company IS NULL
  AND sp.company IS NOT NULL;
