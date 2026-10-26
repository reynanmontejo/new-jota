import { describe, expect, it } from "vitest"

import { calendarMonthQueryWindow, resolveCalendarMonth, shiftCalendarMonth } from "@/features/calendar/calendar-month"

describe("calendar month selection", () => {
  it("accepts a valid shared month and rejects invalid or repeated values", () => {
    const now = new Date("2026-10-31T18:00:00Z")
    expect(resolveCalendarMonth("2026-09", now)).toBe("2026-09")
    expect(resolveCalendarMonth("2026-13", now)).toBe("2026-11")
    expect(resolveCalendarMonth(["2026-09", "2026-10"], now)).toBe("2026-11")
  })

  it("moves across year boundaries", () => {
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01")
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12")
  })

  it("includes dates close to a month boundary in any browser time zone", () => {
    expect(calendarMonthQueryWindow("2026-10")).toEqual({
      startInclusive: "2026-09-30T00:00:00.000Z",
      endExclusive: "2026-11-02T00:00:00.000Z",
    })
  })
})
