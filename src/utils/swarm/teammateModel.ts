import { CLAUDE_OPUS_5_5_CONFIG } from '../model/configs.js'
import { getAPIProvider } from '../model/providers.js'

// @[MODEL LAUNCH]: Update the fallback model below.
// When the user has never set teammateDefaultModel in /config, new teammates
// use the current Opus 5.5 model. Keep the fallback provider-aware.
export function getHardcodedTeammateModelFallback(): string {
  return CLAUDE_OPUS_5_5_CONFIG[getAPIProvider()]
}
