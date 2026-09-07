// Shared between onboarding, settings and any profile view so the values
// stored on `users` (seniority/work_modality) always map to the same labels
// everywhere they're displayed or edited.

export const SENIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'semi_senior', label: 'Semi Senior' },
  { value: 'senior', label: 'Senior' },
]

export const MODALITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'Remoto', label: 'Remoto' },
  { value: 'Híbrido', label: 'Híbrido' },
  { value: 'Presencial', label: 'Presencial' },
]

export const SENIORITY_LABELS: Record<string, string> = Object.fromEntries(
  SENIORITY_OPTIONS.map(o => [o.value, o.label])
)

// Same enum used by the scraper's keyword-classification trigger
// (backend/sql/scraper-classification-migration.sql) — kept in sync so a
// candidate's chosen category always matches what job postings get tagged.
export const ROLE_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'fullstack', label: 'Fullstack' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'devops', label: 'DevOps' },
  { value: 'data_engineer', label: 'Data Engineer' },
  { value: 'data_scientist', label: 'Data Scientist / ML' },
  { value: 'qa', label: 'QA' },
  { value: 'ux_ui', label: 'UX/UI Design' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'customer_support', label: 'Customer Support' },
  { value: 'product', label: 'Product' },
  { value: 'otro', label: 'Otro' },
]

export const ROLE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_CATEGORY_OPTIONS.map(o => [o.value, o.label])
)

// Same tokens the scraper's classification trigger tags job postings with
// (backend/sql/scraper-classification-migration.sql) — a candidate's saved
// skill has to match one of these exact strings for the "Para ti" skill-
// overlap count to ever find anything, so suggestions steer people toward
// the canonical spelling instead of free text that would never match.
export const CANONICAL_SKILLS: { value: string; label: string }[] = [
  { value: 'react', label: 'React' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'nextjs', label: 'Next.js' },
  { value: 'python', label: 'Python' },
  { value: 'nodejs', label: 'Node.js' },
  { value: 'aws', label: 'AWS' },
  { value: 'docker', label: 'Docker' },
  { value: 'kubernetes', label: 'Kubernetes' },
  { value: 'sql', label: 'SQL' },
  { value: 'golang', label: 'Go' },
  { value: 'ia', label: 'IA / Machine Learning' },
  { value: 'figma', label: 'Figma' },
  { value: 'adobe-suite', label: 'Adobe Suite' },
  { value: 'sketch', label: 'Sketch' },
  { value: 'seo', label: 'SEO' },
  { value: 'google-ads', label: 'Google Ads' },
  { value: 'google-analytics', label: 'Google Analytics' },
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'salesforce', label: 'Salesforce' },
  { value: 'zendesk', label: 'Zendesk' },
  { value: 'intercom', label: 'Intercom' },
  { value: 'excel', label: 'Excel' },
  { value: 'canva', label: 'Canva' },
  { value: 'java', label: 'Java' },
  { value: 'dotnet', label: '.NET' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'angular', label: 'Angular' },
  { value: 'vue', label: 'Vue' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'terraform', label: 'Terraform' },
  { value: 'gcp', label: 'GCP' },
  { value: 'azure', label: 'Azure' },
]
