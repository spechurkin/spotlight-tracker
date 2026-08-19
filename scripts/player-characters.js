export function getPlayerCharacterAssignments(users = []) {
  const assignments = new Map();

  for (const user of users ?? []) {
    const actorId = String(user?.character?.id ?? "").trim();
    if (user?.isGM || !actorId) continue;

    const playerNames = assignments.get(actorId) ?? [];
    const playerName = String(user?.name ?? "").trim();
    if (playerName && !playerNames.includes(playerName)) playerNames.push(playerName);
    assignments.set(actorId, playerNames);
  }

  return assignments;
}

export function getPlayerCharacterActors(actors = [], users = [], locale = undefined) {
  const assignments = getPlayerCharacterAssignments(users);

  return [...(actors ?? [])]
    .filter((actor) => assignments.has(String(actor?.id ?? "")))
    .sort((left, right) => String(left?.name ?? "").localeCompare(String(right?.name ?? ""), locale))
    .map((actor) => ({
      actor,
      playerNames: assignments.get(String(actor.id)) ?? []
    }));
}
