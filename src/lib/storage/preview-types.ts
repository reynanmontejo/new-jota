const previewMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime", "application/pdf",
])

const previewExtensions: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg",
  png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  pdf: "application/pdf",
}

export function getPreviewMimeType(mimeType: string | null | undefined, fileName: string) {
  const normalized = (mimeType ?? "").split(";")[0].trim().toLowerCase()
  if (normalized === "image/jpg") return "image/jpeg"
  if (previewMimeTypes.has(normalized)) return normalized
  if (!normalized || ["application/octet-stream", "binary/octet-stream", "application/force-download"].includes(normalized)) {
    const extension = fileName.split(".").at(-1)?.toLowerCase() ?? ""
    return previewExtensions[extension] ?? null
  }
  return null
}
