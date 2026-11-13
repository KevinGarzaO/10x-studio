import { describe, it, expect } from 'vitest'
import { appEnv, linkedinPublishingAllowed, scheduledJobsEnabled } from '@avotalent/core/config/app-env'

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

describe('appEnv', () => {
  it('uses APP_ENV when it is one of the known values (any case, with spaces)', () => {
    expect(appEnv(env({ APP_ENV: 'production' }))).toBe('production')
    expect(appEnv(env({ APP_ENV: ' Staging ' }))).toBe('staging')
    expect(appEnv(env({ APP_ENV: 'beta' }))).toBe('staging')
    expect(appEnv(env({ APP_ENV: 'development' }))).toBe('development')
  })

  it('APP_ENV wins over the Railway environment name', () => {
    expect(appEnv(env({ APP_ENV: 'development', RAILWAY_ENVIRONMENT_NAME: 'production' }))).toBe('development')
  })

  it('without APP_ENV it follows the name of the Railway environment, so production needs no new variable', () => {
    expect(appEnv(env({ RAILWAY_ENVIRONMENT_NAME: 'production' }))).toBe('production')
    expect(appEnv(env({ RAILWAY_ENVIRONMENT_NAME: 'beta' }))).toBe('staging')
    expect(appEnv(env({ RAILWAY_ENVIRONMENT_NAME: 'development' }))).toBe('development')
  })

  it('anything unknown, empty or a typo is development: everything external stays off', () => {
    expect(appEnv(env({}))).toBe('development')
    expect(appEnv(env({ APP_ENV: 'prod' }))).toBe('development')
    expect(appEnv(env({ APP_ENV: 'produccion' }))).toBe('development')
    expect(appEnv(env({ RAILWAY_ENVIRONMENT_NAME: 'qa' }))).toBe('development')
  })
})

describe('what each environment is allowed to do', () => {
  it('scheduled jobs run only in production', () => {
    expect(scheduledJobsEnabled(env({ APP_ENV: 'production' }))).toBe(true)
    expect(scheduledJobsEnabled(env({ APP_ENV: 'staging' }))).toBe(false)
    expect(scheduledJobsEnabled(env({ RAILWAY_ENVIRONMENT_NAME: 'beta' }))).toBe(false)
    expect(scheduledJobsEnabled(env({}))).toBe(false)
  })

  it('only production may publish on the founder\'s LinkedIn', () => {
    expect(linkedinPublishingAllowed(env({ APP_ENV: 'production' }))).toBe(true)
    expect(linkedinPublishingAllowed(env({ APP_ENV: 'staging' }))).toBe(false)
    expect(linkedinPublishingAllowed(env({}))).toBe(false)
  })
})
