import { afterEach, describe, expect, it, vi } from "vitest"
import { getNotificationVolume, playNotificationChime, saveNotificationVolume } from "./notification-sound"
afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals() })

describe("notification audio level", () => {
  it("defaults to 85 percent and preserves the user's volume or mute", () => {
    expect(getNotificationVolume("user-1")).toBe(85)
    saveNotificationVolume("user-1", 40)
    expect(getNotificationVolume("user-1")).toBe(40)
    saveNotificationVolume("user-1", 0)
    expect(getNotificationVolume("user-1")).toBe(0)
  })

  it("plays a louder built-in chime with combined peak below clipping", async () => {
    const peaks: number[] = []
    const createOscillator = vi.fn(() => ({ type: "sine", frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }))
    vi.stubGlobal("AudioContext", class {
      state = "running"; currentTime = 0; destination = {}
      resume = vi.fn(async () => {})
      createOscillator = createOscillator
      createGain = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: (level: number, time: number) => { if (time === .008) peaks.push(level) } } })
    })
    expect(await playNotificationChime("user-1")).toBe(true)
    expect(createOscillator).toHaveBeenCalledTimes(3)
    const peak = peaks.reduce((sum, level) => sum + level, 0)
    expect(peak).toBeGreaterThan(.2)
    expect(peak).toBeLessThan(1)
  })
})
