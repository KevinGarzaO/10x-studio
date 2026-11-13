// Mirrors apps/community/lib/company.ts — kept as a separate copy since the
// backend and the community frontend don't share a package. Any change here
// should be mirrored there (and vice versa) so a company always slugs to the
// same /empresas/:slug on both ends.

export function formatCompanyName(name: string | null | undefined): string {
  if (!name) return ''
  const isAllLower = name === name.toLowerCase() && name !== name.toUpperCase()
  if (!isAllLower) return name
  return name.replace(/\b\w/g, c => c.toUpperCase())
}

export function companySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
