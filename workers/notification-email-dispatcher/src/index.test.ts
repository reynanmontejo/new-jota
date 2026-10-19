import { describe, expect, it } from "vitest"

import { formatNotificationEmail } from "./index"

describe("notification email formatting", () => {
  const baseUrl = new URL("https://new-jota.vercel.app")

  it("links only to an internal Jota path", () => {
    const email = formatNotificationEmail({ title: "Task assigned", body: "Please start soon.", href: "/tasks/123?tab=files" }, baseUrl)
    expect(email).toContain("https://new-jota.vercel.app/tasks/123?tab=files")
  })

  it("rejects external and protocol-relative notification links", () => {
    for (const href of ["https://attacker.example/path", "//attacker.example/path", "/\\attacker.example"]) {
      expect(formatNotificationEmail({ title: "Alert", body: null, href }, baseUrl)).toContain("https://new-jota.vercel.app/")
      expect(formatNotificationEmail({ title: "Alert", body: null, href }, baseUrl)).not.toContain("attacker.example")
    }
  })

  it("bounds title and body text", () => {
    const email = formatNotificationEmail({ title: ` ${"A".repeat(220)} `, body: "B".repeat(600), href: null }, baseUrl)
    expect(email).toContain("A".repeat(180))
    expect(email).not.toContain("A".repeat(181))
    expect(email).toContain("B".repeat(500))
    expect(email).not.toContain("B".repeat(501))
  })
})
