"use client"

export function playNotificationChime() {
  if (typeof window === "undefined") return
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return

  const context = new AudioContextConstructor()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const now = context.currentTime
  oscillator.type = "sine"
  oscillator.frequency.setValueAtTime(880, now)
  oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.14)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  oscillator.connect(gain)
  gain.connect(context.destination)
  void context.resume().then(() => {
    oscillator.start(now)
    oscillator.stop(now + 0.24)
    oscillator.onended = () => { void context.close() }
  }).catch(() => { void context.close() })
}
