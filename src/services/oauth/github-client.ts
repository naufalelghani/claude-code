// GitHub App authentication and organization membership checks
import axios from 'axios'
import { getOauthConfig } from '../../constants/oauth.js'
import { logError } from '../../utils/log.js'
import { logForDebugging } from '../../utils/debug.js'

const GITHUB_OAUTH_BASE_URL = 'https://github.com'
const GITHUB_API_BASE_URL = 'https://api.github.com'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

// Public application identifiers; these are not credentials.
const E5QCJGUF = 'Iv23liLvuX9wFypmgl68'
const GDR037 = 'byv-dev-unorganization'

// Keep the Client Secret empty in the public repository. For a local-only
// build, add a newly generated secret here without committing this change.
const X9CDJSA = ''

// Internal organization GitHub - only members of this org can use GitHub login
const INTERNAL_ORG = 'BYV-Dev-Unorganization'

// OAuth client config for GitHub
interface GitHubOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  appSlug: string
}

// Get GitHub OAuth config from environment or settings
function getGitHubOAuthConfigErrorMessage(): string {
  const missing: string[] = []
  if (!(process.env.GITHUB_APP_SLUG || process.env.CLAUDE_CODE_GITHUB_APP_SLUG || GDR037)) {
    missing.push('App slug')
  }
  if (!(process.env.GITHUB_OAUTH_CLIENT_ID || process.env.CLAUDE_CODE_GITHUB_CLIENT_ID || E5QCJGUF)) {
    missing.push('Client ID')
  }
  if (!(process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.CLAUDE_CODE_GITHUB_CLIENT_SECRET || X9CDJSA)) {
    missing.push('Client Secret')
  }

  if (missing.length === 1 && missing[0] === 'Client Secret') {
    return 'GitHub Organization login is not configured: Client Secret is missing. Set GITHUB_OAUTH_CLIENT_SECRET (or CLAUDE_CODE_GITHUB_CLIENT_SECRET), or set X9CDJSA in src/services/oauth/github-client.ts in your local working copy. Never commit the real secret.'
  }
  return `GitHub Organization login is not configured. Missing: ${missing.join(', ')}.`
}

export function getGitHubOAuthConfig(): GitHubOAuthConfig | null {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.CLAUDE_CODE_GITHUB_CLIENT_ID || E5QCJGUF
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.CLAUDE_CODE_GITHUB_CLIENT_SECRET || X9CDJSA
  const appSlug = process.env.GITHUB_APP_SLUG || process.env.CLAUDE_CODE_GITHUB_APP_SLUG || GDR037

  if (!clientId || !clientSecret || !appSlug) {
    return null
  }

  return {
    clientId,
    clientSecret,
    appSlug,
    redirectUri: getOauthConfig().MANUAL_REDIRECT_URL
  }
}

/**
 * Start a normal GitHub App user-authorization flow for each CLI user.
 * This is necessary because an organization installation is shared and
 * organization members other than the installer must authorize the App
 * independently.
 */
export function buildGitHubAuthUrl(codeChallenge: string, state: string): string {
  const config = getGitHubOAuthConfig()
  if (!config) {
    throw new Error(getGitHubOAuthConfigErrorMessage())
  }

  const url = new URL(`${GITHUB_OAUTH_BASE_URL}/login/oauth/authorize`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

/**
 * Build the one-time installation link shown when the required organization
 * has not installed the App yet. Organization owners may need to approve it.
 */
export function buildGitHubInstallUrl(): string {
  const config = getGitHubOAuthConfig()
  if (!config) {
    throw new Error(getGitHubOAuthConfigErrorMessage())
  }

  return `${GITHUB_OAUTH_BASE_URL}/apps/${encodeURIComponent(config.appSlug)}/installations/new`
}

/**
 * Exchange authorization code for GitHub access token
 */
export async function exchangeGitHubCodeForToken(
  authorizationCode: string,
  codeVerifier: string,
): Promise<{ accessToken: string } | null> {
  const config = getGitHubOAuthConfig()
  if (!config) {
    throw new Error(getGitHubOAuthConfigErrorMessage())
  }

  try {
    const response = await axios.post(
      GITHUB_TOKEN_URL,
      {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code: authorizationCode,
        code_verifier: codeVerifier,
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    )

    if (response.status !== 200 || response.data.error) {
      throw new Error(response.data.error_description || 'Token exchange failed')
    }

    return {
      accessToken: response.data.access_token,
    }
  } catch (error) {
    logError(error as Error, 'GitHub App token exchange failed')
    throw new Error(
      'GitHub authorization code exchange failed. Check the GitHub App Client ID, Client Secret, and registered callback URL, then restart login.',
    )
  }
}

/**
 * Pure predicates kept separately so the installation and membership rules
 * can be covered by unit tests without making live GitHub API requests.
 */
export function hasRequiredGitHubAppInstallation(
  installations: unknown,
  appSlug: string,
  organization: string,
): boolean {
  if (!Array.isArray(installations)) return false

  return installations.some((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false
    const installation = value as {
      app_slug?: string
      target_type?: string
      account?: { login?: string }
    }
    return (
      installation.app_slug?.toLowerCase() === appSlug.toLowerCase() &&
      installation.target_type === 'Organization' &&
      installation.account?.login?.toLowerCase() === organization.toLowerCase()
    )
  })
}

export function isActiveGitHubOrgMembershipState(state: unknown): boolean {
  return state === 'active'
}

/**
 * Verify the GitHub App is installed on the required organization and that the
 * authenticated user can access that installation. This endpoint is scoped to
 * the GitHub App represented by this user access token.
 */
export async function verifyGitHubAppInstallation(
  accessToken: string,
): Promise<boolean> {
  const config = getGitHubOAuthConfig()
  if (!config) {
    throw new Error(getGitHubOAuthConfigErrorMessage())
  }

  try {
    for (let page = 1; page <= 100; page += 1) {
      const response = await axios.get(
        `${GITHUB_API_BASE_URL}/user/installations`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          params: { per_page: 100, page },
          timeout: 10000,
        },
      )

      const installations = response.data?.installations ?? []
      if (hasRequiredGitHubAppInstallation(installations, config.appSlug, INTERNAL_ORG)) {
        return true
      }
      if (
        installations.length < 100 ||
        (typeof response.data?.total_count === 'number' &&
          page * 100 >= response.data.total_count)
      ) {
        return false
      }
    }

    return false
  } catch (error) {
    logError(error as Error, 'GitHub App installation verification failed')
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      if (status === 401) {
        throw new Error('GitHub authorization expired or was rejected. Restart GitHub Organization login.')
      }
      if (status === 403) {
        throw new Error('GitHub denied access to the App installation list. Check the GitHub App configuration and the account permissions, then try again.')
      }
    }
    throw new Error('Could not verify the GitHub App installation with GitHub. Check the network connection and try again.')
  }
}

/**
 * Verify that the authenticated user is an active member of the required
 * GitHub organization. This endpoint describes the current user, not all
 * organization members.
 */
export async function verifyGitHubOrgMembership(
  accessToken: string,
): Promise<boolean> {
  try {
    const response = await axios.get(
      `${GITHUB_API_BASE_URL}/user/memberships/orgs/${encodeURIComponent(INTERNAL_ORG)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        timeout: 10000,
      },
    )

    if (response.status === 200 && isActiveGitHubOrgMembershipState(response.data.state)) {
      return true
    }

    logForDebugging('GitHub org membership check', {
      status: response.status,
      state: response.data?.state,
    })
    return false
  } catch (error) {
    logError(error as Error, 'GitHub org membership verification failed')
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      if (status === 401) {
        throw new Error('GitHub authorization expired or was rejected. Restart GitHub Organization login.')
      }
      if (status === 403) {
        throw new Error('GitHub denied the organization membership check. Ensure the GitHub App has organization Members read-only permission, then retry.')
      }
      if (status === 404) {
        return false
      }
    }
    throw new Error('Could not verify GitHub organization membership with GitHub. Check the network connection and try again.')
  }
}

/**
 * Get user info from GitHub API
 */
export async function getGitHubUserInfo(accessToken: string): Promise<{
  login: string
  name: string
  email: string
  avatarUrl: string
} | null> {
  try {
    const response = await axios.get(`${GITHUB_API_BASE_URL}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 10000,
    })

    return {
      login: response.data.login,
      name: response.data.name ?? response.data.login,
      email: response.data.email ?? '',
      avatarUrl: response.data.avatar_url,
    }
  } catch (error) {
    logError(error as Error, 'Failed to fetch GitHub user info')
    return null
  }
}

/**
 * Verify GitHub OAuth token and exchange for internal CLAUDE_CODE_OAUTH_TOKEN
 * This function handles the full GitHub OAuth flow and returns an OAuth token
 * that can be used like any other Claude Code OAuth token
 */
export async function githubOAuthFlow(
  authorizationCode: string,
  codeVerifier: string,
): Promise<{
  accessToken: string
  user: {
    login: string
    name: string
    email: string
    avatarUrl: string
  }
  subscriptionType: 'internal'
} | null> {
  // Exchange code for GitHub token
  const tokenResponse = await exchangeGitHubCodeForToken(
    authorizationCode,
    codeVerifier,
  )

  if (!tokenResponse) {
    return null
  }

  // Require both the GitHub App installation and active membership. Neither
  // check can substitute for the other.
  const isAppInstalled = await verifyGitHubAppInstallation(tokenResponse.accessToken)
  if (!isAppInstalled) {
    const installUrl = buildGitHubInstallUrl()
    throw new Error(
      `The GitHub App is not installed on ${INTERNAL_ORG}. Ask an organization owner to install or approve it, then restart login.\nInstall link: ${installUrl}`,
    )
  }

  const isOrgMember = await verifyGitHubOrgMembership(tokenResponse.accessToken)
  if (!isOrgMember) {
    throw new Error(
      `Your GitHub account must have active membership in the ${INTERNAL_ORG} organization to use this login method.`,
    )
  }

  // Get user info
  const userInfo = await getGitHubUserInfo(tokenResponse.accessToken)

  if (!userInfo) {
    throw new Error('Failed to retrieve GitHub user information')
  }

  // Exchange GitHub token for internal Anthropic OAuth token
  const anthropicTokenResponse = await axios.post(
    `${getOauthConfig().BASE_API_URL}/api/oauth/github/exchange`,
    {
      github_access_token: tokenResponse.accessToken,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  )

  if (anthropicTokenResponse.status !== 200) {
    throw new Error(
      `Failed to exchange GitHub token: ${anthropicTokenResponse.statusText}`,
    )
  }

  return {
    accessToken: anthropicTokenResponse.data.access_token,
    user: userInfo,
    subscriptionType: 'internal',
  }
}

/**
 * Exchange GitHub OAuth code and get Anthropic internal token
 * Public API for GitHub OAuth flow initiation
 */
export async function githubOAuthExchangeCode(
  authorizationCode: string,
  codeVerifier: string,
): Promise<{
  accessToken: string
  user: {
    login: string
    name: string
    email: string
    avatarUrl: string
  } | null
  subscriptionType: 'internal'
} | null> {
  return githubOAuthFlow(authorizationCode, codeVerifier)
}
