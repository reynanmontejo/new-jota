const videoFormat = /(^|[^a-z0-9])(video|reels?|shorts?|clips?|animations?|motion|tiktok|vlogs?|films?)([^a-z0-9]|$)/i

export function videoProductionOptions<T extends { id: string; display_name: string }>(
  people: readonly T[], primaryId?: string | null, backupId?: string | null, selfId?: string,
) {
  return people.filter((person, index) => [primaryId, backupId, selfId].includes(person.id)
    && people.findIndex((candidate) => candidate.id === person.id) === index)
    .map((person) => ({ ...person, assignmentLabel: person.id === primaryId ? "Primary editor" : person.id === backupId ? "Backup editor" : "You" }))
}

export function isVideoContentFormat(format: string) {
  return videoFormat.test(format.trim())
}

export function suggestedContentAssignee(
  format: string,
  videoEditorId: string | undefined,
  currentUserId: string,
  availableAssignees: ReadonlyArray<{ id: string }>,
) {
  const available = new Set(availableAssignees.map((person) => person.id))
  if (isVideoContentFormat(format) && videoEditorId && available.has(videoEditorId)) return videoEditorId
  return available.has(currentUserId) ? currentUserId : ""
}
