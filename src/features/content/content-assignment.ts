const videoFormat = /(^|[^a-z0-9])(video|reels?|shorts?|clips?|animations?|motion|tiktok|vlogs?|films?)([^a-z0-9]|$)/i

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
