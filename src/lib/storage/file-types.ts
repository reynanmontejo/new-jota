export type FileCategory = "image" | "video" | "document" | "other"

export type FileTypeFilter = "all" | FileCategory

export function getFileCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("application/") || mimeType.startsWith("text/")) return "document"
  return "other"
}

export const fileCategoryLabels: Record<FileCategory, string> = {
  image: "Images",
  video: "Videos",
  document: "Documents",
  other: "Other files",
}
