type ExistingTeammate = {
  name: string
  prompt?: string
}

type TeammateSpawnKey = {
  teamName: string
  name: string
  prompt: string
}

const inFlightSpawnKeys = new Set<string>()

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function duplicateSpawnError(teamName: string, name: string): Error {
  return new Error(
    `Duplicate teammate spawn blocked for "${name}" in team "${teamName}": a teammate with the same name and prompt is already running or registered. Continue the existing teammate with SendMessage instead of spawning another.`,
  )
}

/**
 * Deduplicates identical teammate spawn requests.
 *
 * The in-flight reservation is acquired synchronously before the first await,
 * preventing parallel duplicate tool calls from both passing the check. Once
 * a spawn is registered, matching name+prompt requests are rejected against
 * the persisted team roster. Reusing a name for a different prompt remains
 * supported and can be assigned a unique suffix by the existing spawn flow.
 */
export async function withTeammateSpawnDeduplication<T>(
  key: TeammateSpawnKey,
  loadMembers: () => Promise<readonly ExistingTeammate[]>,
  spawn: () => Promise<T>,
): Promise<T> {
  const normalizedName = normalizeName(key.name)
  const normalizedTeamName = key.teamName.trim().toLocaleLowerCase()
  const normalizedPrompt = key.prompt.trim()
  const signature = JSON.stringify([
    normalizedTeamName,
    normalizedName,
    normalizedPrompt,
  ])

  if (inFlightSpawnKeys.has(signature)) {
    throw duplicateSpawnError(key.teamName, key.name)
  }

  // Reserve before awaiting the team-file read so duplicate parallel calls
  // cannot race through the persisted-roster check together.
  inFlightSpawnKeys.add(signature)
  try {
    const members = await loadMembers()
    const duplicate = members.some(
      member =>
        normalizeName(member.name) === normalizedName &&
        (member.prompt ?? '').trim() === normalizedPrompt,
    )
    if (duplicate) {
      throw duplicateSpawnError(key.teamName, key.name)
    }

    return await spawn()
  } finally {
    inFlightSpawnKeys.delete(signature)
  }
}
