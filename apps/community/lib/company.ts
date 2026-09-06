// Scraped job sources are inconsistent about casing — some send "palantir",
// "jumpcloud" all-lowercase, others send properly-cased names like "Twilio".
// Only Title-Case the ones that look untouched (fully lowercase); leave
// anything with intentional casing (GitLab, JumpCloud) exactly as-is.
export function formatCompanyName(name: string | null | undefined): string {
  if (!name) return ''
  const isAllLower = name === name.toLowerCase() && name !== name.toUpperCase()
  if (!isAllLower) return name
  return name.replace(/\b\w/g, c => c.toUpperCase())
}

// Companies aren't a real entity in the backend (job posts just carry a free-text
// company name), so we derive a stable URL slug from that name on both ends:
// when linking to a company page, and when matching posts against the slug in it.
export function companySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
