// Shared between onboarding, settings and any profile view so the values
// stored on `users` (seniority/work_modality) always map to the same labels
// everywhere they're displayed or edited.
//
// Los valores salen de @avocado/schemas, el mismo enum que valida el backend:
// aquí solo viven sus etiquetas visibles.

import { SENIORITY, ROLE_CATEGORY, WORK_MODALITY, type Seniority, type RoleCategory } from '@avocado/schemas'

const SENIORITY_LABEL: Record<Seniority, string> = {
  junior: 'Junior',
  semi_senior: 'Semi Senior',
  senior: 'Senior',
}

const ROLE_CATEGORY_LABEL: Record<RoleCategory, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Fullstack',
  mobile: 'Mobile',
  devops: 'DevOps',
  data_engineer: 'Data Engineer',
  data_scientist: 'Data Scientist / ML',
  qa: 'QA',
  ux_ui: 'UX/UI Design',
  marketing: 'Marketing',
  customer_support: 'Customer Support',
  product: 'Product',
  otro: 'Otro',
}

export const SENIORITY_OPTIONS: { value: string; label: string }[] = SENIORITY.map(value => ({
  value,
  label: SENIORITY_LABEL[value],
}))

export const MODALITY_OPTIONS: { value: string; label: string }[] = WORK_MODALITY.map(value => ({
  value,
  label: value,
}))

export const SENIORITY_LABELS: Record<string, string> = Object.fromEntries(
  SENIORITY_OPTIONS.map(o => [o.value, o.label])
)

// Same enum used by the scraper's keyword-classification trigger
// (backend/sql/scraper-classification-migration.sql) — kept in sync so a
// candidate's chosen category always matches what job postings get tagged.
export const ROLE_CATEGORY_OPTIONS: { value: string; label: string }[] = ROLE_CATEGORY.map(
  value => ({ value, label: ROLE_CATEGORY_LABEL[value] })
)

export const ROLE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_CATEGORY_OPTIONS.map(o => [o.value, o.label])
)

// El catálogo de skills ya no vive aquí: lo sirve el backend desde la tabla
// `skills` (GET /api/community/skills), porque un skill aprobado por el
// superadmin tiene que aparecer de inmediato sin volver a desplegar el
// frontend. Úsalo con useSkillCatalog() de ./skill-catalog.
