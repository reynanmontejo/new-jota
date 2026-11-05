import { helpGuides } from "@/features/help/help-guides"

export function findAssistantGuides(question: string, administrator = false) {
  const terms = question.toLowerCase().match(/[a-z]{3,}/g)?.filter((term) => !["the", "and", "how", "can", "what", "does", "this", "with", "for", "you", "please"].includes(term)) ?? []
  return helpGuides.filter((guide) => administrator || guide.section !== "Administrators").map((guide) => {
    const title = `${guide.title} ${guide.slug}`.toLowerCase()
    const body = `${guide.summary} ${guide.steps.map((step) => step.title).join(" ")}`.toLowerCase()
    return { guide, score: terms.reduce((score, term) => score + (title.includes(term) ? 4 : body.includes(term) ? 1 : 0), 0) }
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(({ guide }) => guide)
}

export function assistantGuideReply(question: string, administrator = false) {
  const guides = findAssistantGuides(question, administrator)
  const guide = guides[0]
  return {
    reply: guide ? `${guide.title}\n\n${guide.steps.slice(0, 3).map((step, index) => `${index + 1}. ${step.title}: ${step.body}`).join("\n\n")}\n\n${guide.remember}`
      : "I can help you find your way around Jota. Try asking about clients, content import, assigning video work, reviews, files, or daily reports. To save a work update, start with “Save:”. To prepare your report, say “Generate my daily report”.",
    sources: guides.map((item) => ({ title: item.title, href: `/help/${item.slug}` })),
    mode: "guides" as const,
  }
}

export function parseReportCommand(message: string): { action: "note"; body: string } | { action: "generate" } | null {
  const note = message.match(/^(?:save|log|note)\s*:\s*([\s\S]*)$/i)
  if (note) return { action: "note", body: note[1].trim() }
  if (/^(?:please\s+)?(?:generate|prepare|create)\s+(?:(?:my|a|the|today['’]?s)\s+)?(?:daily\s+)?report[.!]?$/i.test(message.trim())) return { action: "generate" }
  return null
}

export function composeDailyReport(name: string, date: string, notes: { body: string }[]) {
  return `Daily report — ${date}\n${name}\n\nWork updates\n${notes.map(({ body }) => `• ${body}`).join("\n")}`
}
