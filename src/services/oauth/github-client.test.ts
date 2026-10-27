import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildGitHubInstallUrl,
  getGitHubOAuthConfig,
  hasRequiredGitHubAppInstallation,
  isActiveGitHubOrgMembershipState,
} from './github-client.js'

const ENV_NAMES = [
  'GITHUB_APP_SLUG',
  'CLAUDE_CODE_GITHUB_APP_SLUG',
  'GITHUB_OAUTH_CLIENT_ID',
  'CLAUDE_CODE_GITHUB_CLIENT_ID',
  'GITHUB_OAUTH_CLIENT_SECRET',
  'CLAUDE_CODE_GITHUB_CLIENT_SECRET',
] as const

const originalEnv = Object.fromEntries(
  ENV_NAMES.map(name => [name, process.env[name]]),
)

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnv[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('GitHub App organization login configuration', () => {
  test('builds the installation link with the configured app slug and state', () => {
    process.env.GITHUB_APP_SLUG = 'byv-code'
    process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client-id'
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret'

    const url = new URL(buildGitHubInstallUrl('session_state_123'))

    expect(url.origin).toBe('https://github.com')
    expect(url.pathname).toBe('/apps/byv-code/installations/new')
    expect(url.searchParams.get('state')).toBe('session_state_123')
  })

  test('supports the CLAUDE_CODE_GITHUB_* environment aliases', () => {
    delete process.env.GITHUB_APP_SLUG
    delete process.env.GITHUB_OAUTH_CLIENT_ID
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET
    process.env.CLAUDE_CODE_GITHUB_APP_SLUG = 'byv-code'
    process.env.CLAUDE_CODE_GITHUB_CLIENT_ID = 'test-client-id'
    process.env.CLAUDE_CODE_GITHUB_CLIENT_SECRET = 'test-client-secret'

    expect(getGitHubOAuthConfig()?.appSlug).toBe('byv-code')
    expect(new URL(buildGitHubInstallUrl('state')).pathname).toBe(
      '/apps/byv-code/installations/new',
    )
  })

  test('requires an installation for the exact App on the target organization', () => {
    const targetInstallation = {
      app_slug: 'byv-code',
      target_type: 'Organization',
      account: { login: 'BYV-Dev-Unorganization' },
    }

    expect(
      hasRequiredGitHubAppInstallation(
        [targetInstallation],
        'byv-code',
        'BYV-Dev-Unorganization',
      ),
    ).toBe(true)
    expect(
      hasRequiredGitHubAppInstallation(
        [targetInstallation],
        'another-app',
        'BYV-Dev-Unorganization',
      ),
    ).toBe(false)
    expect(
      hasRequiredGitHubAppInstallation(
        [targetInstallation],
        'byv-code',
        'some-other-org',
      ),
    ).toBe(false)
    expect(
      hasRequiredGitHubAppInstallation(
        [{ ...targetInstallation, target_type: 'User' }],
        'byv-code',
        'BYV-Dev-Unorganization',
      ),
    ).toBe(false)
  })

  test('only active organization membership passes', () => {
    expect(isActiveGitHubOrgMembershipState('active')).toBe(true)
    expect(isActiveGitHubOrgMembershipState('pending')).toBe(false)
    expect(isActiveGitHubOrgMembershipState(undefined)).toBe(false)
  })

  test('fails with an actionable message when the App is not configured', () => {
    delete process.env.GITHUB_APP_SLUG
    delete process.env.CLAUDE_CODE_GITHUB_APP_SLUG
    delete process.env.GITHUB_OAUTH_CLIENT_ID
    delete process.env.CLAUDE_CODE_GITHUB_CLIENT_ID
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET
    delete process.env.CLAUDE_CODE_GITHUB_CLIENT_SECRET

    expect(() => buildGitHubInstallUrl('state')).toThrow(
      'Set GITHUB_APP_SLUG, GITHUB_OAUTH_CLIENT_ID, and GITHUB_OAUTH_CLIENT_SECRET.',
    )
  })
})
