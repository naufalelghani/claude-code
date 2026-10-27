import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { getGlobalConfig } from '../config.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'openai'

type ProviderEnvironment = {
  CLAUDE_CODE_USE_BEDROCK?: string
  CLAUDE_CODE_USE_VERTEX?: string
  CLAUDE_CODE_USE_FOUNDRY?: string
  CLAUDE_CODE_USE_OPENAI?: string
}

/** Pure provider resolution, exported so precedence is covered by unit tests. */
export function resolveAPIProvider(
  env: ProviderEnvironment,
  codexOAuthActive: boolean,
): APIProvider {
  if (isEnvTruthy(env.CLAUDE_CODE_USE_BEDROCK)) return 'bedrock'
  if (isEnvTruthy(env.CLAUDE_CODE_USE_VERTEX)) return 'vertex'
  if (isEnvTruthy(env.CLAUDE_CODE_USE_FOUNDRY)) return 'foundry'
  if (env.CLAUDE_CODE_USE_OPENAI !== undefined) {
    return isEnvTruthy(env.CLAUDE_CODE_USE_OPENAI) ? 'openai' : 'firstParty'
  }
  return codexOAuthActive ? 'openai' : 'firstParty'
}

export function getAPIProvider(): APIProvider {
  const codexOAuth = getGlobalConfig().codexOAuth
  // Existing Codex tokens predate the active preference. Treat those as the
  // selected provider until the user logs into another provider explicitly.
  const codexOAuthActive =
    codexOAuth?.active ?? Boolean(codexOAuth?.accessToken)
  return resolveAPIProvider(process.env, codexOAuthActive)
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
