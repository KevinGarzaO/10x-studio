import { ROLE_CATEGORY, ROLE_CATEGORY_LABEL, type RoleCategory } from '@avocado/schemas'

/**
 * Los puestos en las direcciones del sitio: `/puestos/ux-ui` en vez de `/puestos/ux_ui`. Una dirección
 * con guiones se lee y se comparte mejor, y es la forma que prefieren los buscadores.
 *
 * "otro" no es un puesto: es lo que no se pudo clasificar, así que no tiene página.
 */
export const PUBLIC_ROLES: RoleCategory[] = ROLE_CATEGORY.filter((role): role is RoleCategory => role !== 'otro')

export const roleSlug = (role: string): string => role.replace(/_/g, '-')

/** La clave de un puesto a partir de su dirección (`ux-ui` o `ux_ui`), o null si no existe. */
export function roleFromSlug(slug: string): RoleCategory | null {
  const key = slug.toLowerCase().trim().replace(/-/g, '_')
  return (PUBLIC_ROLES as string[]).includes(key) ? (key as RoleCategory) : null
}

export const roleLabel = (role: string): string => ROLE_CATEGORY_LABEL[role as RoleCategory] ?? role
