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
    `Duplicate teammate spawn blocked for "${name}" in team "${teamName}": a teammate with the same name and prompt is already registered. Continue the existing teammate with SendMessage instead of spawning another.`,
  )
}

function spawnInFlightError(teamName: string, name: string): Error {
  return new Error(
    `Duplicate teammate spawn blocked for "${name}" in team "${teamName}": another spawn with this name is already in progress. Wait for its result before retrying.`,
  )
}

/**
 * Deduplicates identical teammate spawn requests.
 *
 * The in-flight reservation is acquired synchronously before the first await,
 * preventing parallel calls for the same teammate name from racing through
 * name allocation. Once a spawn is registered, matching name+prompt requests
 * are rejected against the persisted team roster. Reusing a name later for a
 * different prompt remains supported and can receive a unique suffix.
 */
export async function withTeammateSpawnDeduplication<T>(
  key: TeammateSpawnKey,
  loadMembers: () => Promise<readonly ExistingTeammate[]>,
  spawn: () => Promise<T>,
): Promise<T> {
  const normalizedName = normalizeName(key.name)
  const normalizedTeamName = key.teamName.trim().toLocaleLowerCase()
  const normalizedPrompt = key.prompt.trim()
  const signature = JSON.stringify([normalizedTeamName, normalizedName])

  if (inFlightSpawnKeys.has(signature)) {
    throw spawnInFlightError(key.teamName, key.name)
  }

  // Reserve the name before awaiting the team-file read. Even if a duplicate
  // call changes its prompt slightly, it cannot race name allocation while
  // the original spawn is still being registered.
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
