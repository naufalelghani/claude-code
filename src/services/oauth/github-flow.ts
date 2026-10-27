// GitHub OAuth flow for ConsoleOAuthFlow integration
// This module provides GitHub Organization login support for Internal team members
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from 'src/services/analytics/index.js'
import { type OAuthStatus } from '../../components/ConsoleOAuthFlow.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { githubOAuthExchangeCode, githubOAuthFlowWithAccessToken, pollGitHubDeviceCode, requestGitHubDeviceCode } from './github-client.js'
import { logError } from '../../utils/log.js'
import { logForDebugging } from '../../utils/debug.js'
import { openBrowser } from '../../utils/browser.js'

function saveGitHubLoginSession(
  accessToken: string,
  user: { login: string; name: string; email: string; avatarUrl: string },
): void {
  saveGlobalConfig(current => ({
    ...current,
    hasCompletedOnboarding: true,
    githubOAuth: {
      accessToken,
      login: user.login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    },
  }))
}

/**
 * Start GitHub Device Flow for CLI login. Device Flow does not require a
 * Client Secret, so a source checkout can work without embedding credentials.
 */
export async function startGitHubOAuthFlow(
  onStatusUpdate: (status: OAuthStatus) => void,
  onLoginSuccess: () => void,
): Promise<void> {
  try {
    logEvent('tengu_oauth_github_flow_start', {})
    const device = await requestGitHubDeviceCode()

    try {
      await openBrowser(device.verificationUri)
    } catch (e) {
      logForDebugging('GitHub Device Flow: Failed to open browser automatically', {
        error: (e as Error)?.message ?? 'unknown',
      })
    }

    onStatusUpdate({
      state: 'waiting_for_login',
      url: device.verificationUri,
      userCode: device.userCode,
      deviceFlow: true,
    })

    const githubAccessToken = await pollGitHubDeviceCode(
      device.deviceCode,
      device.interval,
      device.expiresIn,
    )
    onStatusUpdate({ state: 'creating_api_key' })

    const result = await githubOAuthFlowWithAccessToken(githubAccessToken)
    if (!result) throw new Error('Failed to exchange GitHub device authorization for an internal token')

    saveGitHubLoginSession(githubAccessToken, result.user)

    logEvent('tengu_oauth_github_success', { loginMethod: 'github' })
    onStatusUpdate({ state: 'success' })
    onLoginSuccess()
  } catch (error) {
    logError(error as Error, 'GitHub Device Flow failed')
    logEvent('tengu_oauth_github_error', {
      error: (error as Error).message as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    })
    onStatusUpdate({
      state: 'error',
      message: (error as Error).message,
      toRetry: { state: 'idle' }
    })
  }
}

/**
 * Handle manual GitHub OAuth code submission
 * This is called when the user pastes their GitHub OAuth code
 */
export async function handleGitHubManualCode(
  authorizationCode: string,
  codeVerifier: string,
  onStatusUpdate: (status: OAuthStatus) => void,
  onLoginSuccess: () => void,
): Promise<void> {
  try {
    logEvent('tengu_oauth_github_manual_entry', {})

    // Exchange GitHub code for Anthropic OAuth token
    onStatusUpdate({ state: 'creating_api_key' })

    const result = await githubOAuthExchangeCode(authorizationCode, codeVerifier)

    if (!result) {
      throw new Error('Failed to exchange GitHub code for Anthropic token')
    }

    if (!result.user) {
      throw new Error('GitHub login did not return a user profile.')
    }
    saveGitHubLoginSession(result.accessToken, result.user)

    logEvent('tengu_oauth_github_success', {
      loginMethod: 'github'
    })

    onStatusUpdate({ state: 'success' })

    onLoginSuccess()
  } catch (error) {
    logError(error as Error)
    logEvent('tengu_oauth_github_token_exchange_error', {
      error: (error as Error).message as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    })
    onStatusUpdate({
      state: 'error',
      message: (error as Error).message,
      toRetry: { state: 'idle' }
    })
  }
}

// Re-export OAuthStatus for type compatibility
export type { OAuthStatus }
