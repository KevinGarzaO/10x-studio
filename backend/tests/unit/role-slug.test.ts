import { describe, it, expect } from 'vitest'
import { PUBLIC_ROLES, roleFromSlug, roleSlug } from '../../services/seo/role-slug'
import { FOCUS_ROLES } from '../../services/audience/role-focus'

describe('role slugs', () => {
  it('turns the underscore of a role into a dash for the address', () => {
    expect(roleSlug('ux_ui')).toBe('ux-ui')
    expect(roleSlug('backend')).toBe('backend')
  })

  it('finds the role from either spelling', () => {
    expect(roleFromSlug('ux-ui')).toBe('ux_ui')
    expect(roleFromSlug('UX_UI')).toBe('ux_ui')
  })

  it('has no page for "otro" or for a role that does not exist', () => {
    expect(roleFromSlug('otro')).toBeNull()
    expect(roleFromSlug('astronauta')).toBeNull()
  })

  it('every focus role has a page', () => {
    for (const role of FOCUS_ROLES) expect(PUBLIC_ROLES).toContain(role)
  })
})
