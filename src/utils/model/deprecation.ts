/**
 * Model deprecation utilities
 *
 * Contains information about deprecated models and their retirement dates.
 */

import { type APIProvider, getAPIProvider } from './providers.js'

type DeprecatedModelInfo = {
  isDeprecated: true
  modelName: string
  retirementDate: string
}

type NotDeprecatedInfo = {
  isDeprecated: false
}

type DeprecationInfo = DeprecatedModelInfo | NotDeprecatedInfo

type DeprecationEntry = {
  /** Human-readable model name */
  modelName: string
  /** Retirement dates by provider (null = not deprecated for that provider) */
  retirementDates: Record<APIProvider, string | null>
}

/**
 * Deprecated models and their retirement dates by provider.
 * Keys are substrings to match in model IDs (case-insensitive).
 * To add a new deprecated model, add an entry to this object.
 */
const DEPRECATED_MODELS: Record<string, DeprecationEntry> = {
  // Current Anthropic API schedule: Sonnet 4.5 is deprecated and retires
  // on November 30, 2026. Other provider dates are left unknown until confirmed.
  'claude-sonnet-4-5': {
    modelName: 'Claude Sonnet 4.5',
    retirementDates: {
      firstParty: 'November 30, 2026',
      bedrock: null,
      vertex: null,
      foundry: null,
      openai: null,
    },
  },
  'claude-opus-4-1': {
    modelName: 'Claude Opus 4.1',
    retirementDates: {
      firstParty: 'August 5, 2026',
      bedrock: null,
      vertex: null,
      foundry: null,
      openai: null,
    },
  },
  'claude-opus-4-20250514': {
    modelName: 'Claude Opus 4',
    retirementDates: {
      firstParty: 'June 15, 2026',
      bedrock: null,
      vertex: null,
      foundry: null,
      openai: null,
    },
  },
  'claude-sonnet-4-20250514': {
    modelName: 'Claude Sonnet 4',
    retirementDates: {
      firstParty: 'June 15, 2026',
      bedrock: null,
      vertex: null,
      foundry: null,
      openai: null,
    },
  },
  'claude-3-opus': {
    modelName: 'Claude 3 Opus',
    retirementDates: {
      firstParty: 'January 5, 2026',
      bedrock: 'January 15, 2026',
      vertex: 'January 5, 2026',
      foundry: 'January 5, 2026',
      openai: null,
    },
  },
  'claude-3-7-sonnet': {
    modelName: 'Claude 3.7 Sonnet',
    retirementDates: {
      firstParty: 'February 19, 2026',
      bedrock: 'April 28, 2026',
      vertex: 'May 11, 2026',
      foundry: 'February 19, 2026',
      openai: null,
    },
  },
  'claude-3-5-haiku': {
    modelName: 'Claude 3.5 Haiku',
    retirementDates: {
      firstParty: 'February 19, 2026',
      bedrock: null,
      vertex: null,
      foundry: null,
      openai: null,
    },
  },
  'claude-3-haiku': {
    modelName: 'Claude 3 Haiku',
    retirementDates: {
      firstParty: 'April 20, 2026',
      bedrock: null,
      vertex: null,
      foundry: null,
      openai: null,
    },
  },
}

/**
 * Check if a model is deprecated and get its deprecation info
 */
function getDeprecatedModelInfo(modelId: string): DeprecationInfo {
  const lowercaseModelId = modelId.toLowerCase()
  const provider = getAPIProvider()

  for (const [key, value] of Object.entries(DEPRECATED_MODELS)) {
    const retirementDate = value.retirementDates[provider]
    if (!lowercaseModelId.includes(key) || !retirementDate) {
      continue
    }
    return {
      isDeprecated: true,
      modelName: value.modelName,
      retirementDate,
    }
  }

  return { isDeprecated: false }
}

/**
 * Get a deprecation warning message for a model, or null if not deprecated
 */
export function getModelDeprecationWarning(
  modelId: string | null,
): string | null {
  if (!modelId) {
    return null
  }

  const info = getDeprecatedModelInfo(modelId)
  if (!info.isDeprecated) {
    return null
  }

  const retirementTime = new Date(info.retirementDate).getTime()
  const retired = Number.isFinite(retirementTime) && Date.now() >= retirementTime
  const statusText = retired ? 'was retired' : 'is scheduled to retire'
  return `⚠ ${info.modelName} ${statusText} on ${info.retirementDate}. Switch to one of the current Claude models: Fable 5.1, Opus 5.5, Sonnet 5.5, or Haiku 5.5.`
}
