"use client"

export function playNotificationChime() {
  if (typeof window === "undefined") return
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return

  const context = new AudioContextConstructor()
  void context.resume().then(() => {
    const now = context.currentTime
    // A soft bell strike: metallic overtones fade faster than the main note.
    const partials = [
      { frequency: 1046.5, volume: 0.09, decay: 1.1 },
      { frequency: 2093, volume: 0.035, decay: 0.7 },
      { frequency: 2920, volume: 0.018, decay: 0.4 },
    ]
    partials.forEach(({ frequency, volume, decay }, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
        if (index === 0) void context.close().catch(() => {})
      }
      oscillator.start(now)
      oscillator.stop(now + decay + 0.02)
    })
  }).catch(() => { void context.close() })
}
