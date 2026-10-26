const DAY_MS = 86_400_000
const validMonth = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/

export function resolveCalendarMonth(value: string | string[] | undefined, now = new Date()) {
  if (typeof value === "string" && validMonth.test(value)) return value
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).formatToParts(now)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  return `${year}-${month}`
}

export function shiftCalendarMonth(monthKey: string, offset: number) {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  const year = date.getUTCFullYear()
  if (year < 1 || year > 9999) return monthKey
  return `${String(year).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Include a day on either side so browser-local dates near midnight are not missed. */
export function calendarMonthQueryWindow(monthKey: string) {
  const firstDay = new Date(`${monthKey}-01T00:00:00.000Z`)
  const nextMonth = new Date(firstDay)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  return {
    startInclusive: new Date(firstDay.getTime() - DAY_MS).toISOString(),
    endExclusive: new Date(nextMonth.getTime() + DAY_MS).toISOString(),
  }
}
